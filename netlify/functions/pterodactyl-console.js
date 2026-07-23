import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import { randomBytes } from 'crypto';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, pterodactyl-base-url, pterodactyl-api-key, pterodactyl-server-id',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: 'OK' };
    }

    const baseUrl = (event.headers['pterodactyl-base-url'] || '').trim().replace(/\/$/, '');
    const apiKey = (event.headers['pterodactyl-api-key'] || '').trim();
    const serverId = (event.headers['pterodactyl-server-id'] || '').trim();
    // Optional: frontend can pass a previously-obtained token/socket to skip
    // the rate-limited Panel REST call on every single poll.
    const cachedToken = (event.headers['pterodactyl-ws-token'] || '').trim();
    const cachedSocket = (event.headers['pterodactyl-ws-socket'] || '').trim();

    if (!baseUrl || !apiKey || !serverId) {
        return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing required headers' })
        };
    }

    let token, socketUrl, rawWsData;
    let credentialsRefreshed = false;

    if (cachedToken && cachedSocket) {
        // Reuse credentials supplied by the frontend — no REST call to the Panel here,
        // so this path never counts against the Panel's API rate limit.
        token = cachedToken;
        socketUrl = cachedSocket;
    } else {
        // Step 1: Get WebSocket credentials via REST (server-side, no Mixed Content issues)
        const wsCredsUrl = `${baseUrl}/api/client/servers/${serverId}/websocket`;
        try {
            rawWsData = await httpGetJson(wsCredsUrl, apiKey);
            // Pterodactyl returns {data: {token, socket}} (NOT {attributes: {token, socket}})
            const attr = rawWsData?.attributes ||
                rawWsData?.data?.attributes ||
                rawWsData?.data || {};
            token = attr.token;
            socketUrl = attr.socket;
            credentialsRefreshed = true;

            // If Wings FQDN is a private/local IP, replace it with the panel's host
            // so Netlify can attempt to reach it via the external IP.
            if (socketUrl) {
                const panelUrl = new URL(baseUrl);
                const panelHost = panelUrl.hostname;
                const isLocalIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(
                    new URL(socketUrl).hostname
                );
                if (isLocalIp && panelHost) {
                    const wsUrl = new URL(socketUrl);
                    wsUrl.hostname = panelHost;
                    socketUrl = wsUrl.toString();
                }
            }
        } catch (err) {
            return {
                statusCode: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    logs: [],
                    debug: { step: 'get_ws_credentials', error: err.message, url: wsCredsUrl }
                })
            };
        }
    }

    if (!token || !socketUrl) {
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                logs: [],
                debug: { step: 'parse_ws_credentials', error: 'No token or socket URL', raw: rawWsData }
            })
        };
    }

    // Step 2: Connect via native Node.js net/tls (no external deps)
    let wsResult = { logs: [], error: null, authOk: false };
    try {
        wsResult = await collectLogsNative(socketUrl, token, 4000);
    } catch (err) {
        wsResult.error = err.message;
    }

    // If auth never succeeded and we were using cached credentials, the token
    // has likely expired — tell the frontend to drop the cache and refetch.
    const needsRefresh = !wsResult.authOk && !!cachedToken;

    return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            logs: wsResult.logs,
            // Frontend should cache these on every response so the next poll can reuse them
            wsToken: token,
            wsSocket: socketUrl,
            needsRefresh,
            debug: { socketUrl, logsCount: wsResult.logs.length, wsError: wsResult.error || null, credentialsRefreshed, authOk: wsResult.authOk }
        })
    };
};

function httpGetJson(url, apiKey) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const transport = parsedUrl.protocol === 'https:' ? https : http;
            const options = {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Netlify-Console-Bridge/1.0'
                },
                rejectUnauthorized: false,
            };

            const req = transport.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try { resolve(JSON.parse(data)); }
                        catch { resolve({}); }
                    } else {
                        let detail = `HTTP ${res.statusCode}`;
                        try {
                            const errData = JSON.parse(data);
                            detail = errData?.errors?.[0]?.detail || errData?.error || detail;
                        } catch { }
                        reject(new Error(detail));
                    }
                });
            });

            req.setTimeout(10000, () => { req.destroy(); reject(new Error('HTTP Timeout after 10s')); });
            req.on('error', (e) => reject(new Error(e.message)));
            req.end();
        } catch (e) {
            reject(new Error(`httpGetJson setup error: ${e.message}`));
        }
    });
}

/**
 * Builds an RFC 6455-compliant CLIENT->SERVER WebSocket frame.
 * Per spec, every frame sent BY A CLIENT MUST be masked with a random
 * 4-byte key, and the payload MUST be XORed against it byte-by-byte.
 * Servers are allowed (and many, including Wings, do) to silently
 * DROP any client frame that arrives unmasked — no error, just nothing
 * happens, which is exactly the "handshake ok but zero output" symptom.
 */
function sendWsFrame(socket, text) {
    try {
        const payload = Buffer.from(text, 'utf8');
        const len = payload.length;

        let header;
        if (len < 126) {
            header = Buffer.alloc(2);
            header[0] = 0x81; // FIN + text frame opcode
            header[1] = 0x80 | len; // MASK bit set + length
        } else if (len < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x81;
            header[1] = 0x80 | 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.alloc(10);
            header[0] = 0x81;
            header[1] = 0x80 | 127;
            header.writeBigUInt64BE(BigInt(len), 2);
        }

        const maskKey = randomBytes(4);
        const maskedPayload = Buffer.alloc(len);
        for (let i = 0; i < len; i++) {
            maskedPayload[i] = payload[i] ^ maskKey[i % 4];
        }

        socket.write(Buffer.concat([header, maskKey, maskedPayload]));
    } catch { }
}

/**
 * WebSocket client using only Node.js built-in net/tls/crypto modules.
 * No external dependencies required — works in Netlify Functions as-is.
 */
function collectLogsNative(socketUrl, token, timeoutMs) {
    return new Promise((resolve) => {
        const logs = [];
        let finished = false;
        let buffer = Buffer.alloc(0);
        let wsHandshakeDone = false;
        let httpResponseBuf = '';
        let authOk = false;

        const finish = (errMsg) => {
            if (finished) return;
            finished = true;
            try { socket.destroy(); } catch { }
            resolve({ logs, error: errMsg || null, authOk });
        };

        const deadline = setTimeout(() => finish(null), timeoutMs);

        let parsedUrl;
        try {
            parsedUrl = new URL(socketUrl);
        } catch (e) {
            clearTimeout(deadline);
            return resolve({ logs, error: `Invalid socket URL: ${socketUrl}` });
        }

        const isSecure = parsedUrl.protocol === 'wss:';
        const host = parsedUrl.hostname;
        const port = parseInt(parsedUrl.port) || (isSecure ? 443 : 80);
        const path = (parsedUrl.pathname || '/') + (parsedUrl.search || '');

        const wsKey = randomBytes(16).toString('base64');

        const upgradeRequest = [
            `GET ${path} HTTP/1.1`,
            `Host: ${host}:${port}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Key: ${wsKey}`,
            `Sec-WebSocket-Version: 13`,
            `Origin: https://server-manfredonia.netlify.app`,
            `\r\n`
        ].join('\r\n');

        const onData = (chunk) => {
            if (!wsHandshakeDone) {
                httpResponseBuf += chunk.toString('binary');
                const headerEnd = httpResponseBuf.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;

                if (!httpResponseBuf.startsWith('HTTP/1.1 101')) {
                    clearTimeout(deadline);
                    return finish(`WS Handshake failed: ${httpResponseBuf.substring(0, 100)}`);
                }

                wsHandshakeDone = true;
                // Any bytes after the HTTP headers are the start of the WS stream
                const httpBufLen = Buffer.byteLength(httpResponseBuf, 'binary');
                const chunkLen = chunk.length;
                const afterHeaders = httpBufLen - (headerEnd + 4);
                if (afterHeaders > 0 && chunkLen >= afterHeaders) {
                    buffer = chunk.slice(chunkLen - afterHeaders);
                } else {
                    buffer = Buffer.alloc(0);
                }
                sendWsFrame(socket, JSON.stringify({ event: 'auth', args: [token] }));
            } else {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // Parse WebSocket frames (server->client frames are NOT masked)
            while (buffer.length >= 2) {
                const firstByte = buffer[0];
                const secondByte = buffer[1];
                const opcode = firstByte & 0x0f;
                let payloadLength = secondByte & 0x7f;
                let offset = 2;

                if (payloadLength === 126) {
                    if (buffer.length < 4) break;
                    payloadLength = buffer.readUInt16BE(2);
                    offset = 4;
                } else if (payloadLength === 127) {
                    if (buffer.length < 10) break;
                    payloadLength = Number(buffer.readBigUInt64BE(2));
                    offset = 10;
                }

                if (buffer.length < offset + payloadLength) break;

                const payload = buffer.slice(offset, offset + payloadLength);
                buffer = buffer.slice(offset + payloadLength);

                if (opcode === 1) {
                    try {
                        const msg = JSON.parse(payload.toString('utf8'));
                        if (msg.event === 'auth success') {
                            authOk = true;
                            sendWsFrame(socket, JSON.stringify({ event: 'send logs', args: [] }));
                        } else if (msg.event === 'console output') {
                            const rawLog = msg.args?.[0] || '';
                            const clean = rawLog.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
                            if (clean) logs.push(clean);
                        } else if (msg.event === 'token expiring' || msg.event === 'token expired') {
                            // Not handled here: a single short-lived poll doesn't need refresh
                        }
                    } catch { }
                } else if (opcode === 8) {
                    // Connection close frame
                    clearTimeout(deadline);
                    finish(null);
                    return;
                }
            }
        };

        let socket;
        try {
            if (isSecure) {
                socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
                    socket.write(upgradeRequest);
                });
            } else {
                socket = net.connect({ host, port }, () => {
                    socket.write(upgradeRequest);
                });
            }

            socket.setTimeout(timeoutMs);
            socket.on('data', onData);
            socket.on('timeout', () => { clearTimeout(deadline); finish(null); });
            socket.on('error', (e) => { clearTimeout(deadline); finish(e.message); });
            socket.on('close', () => { clearTimeout(deadline); finish(null); });
        } catch (e) {
            clearTimeout(deadline);
            resolve({ logs, error: `Socket setup error: ${e.message}` });
        }
    });
}