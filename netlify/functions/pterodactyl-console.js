import http from 'http';
import https from 'https';

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

    if (!baseUrl || !apiKey || !serverId) {
        return {
            statusCode: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Missing required headers' })
        };
    }

    // Step 1: Get WebSocket credentials via REST
    const wsCredsUrl = `${baseUrl}/api/client/servers/${serverId}/websocket`;
    let token, socketUrl, rawWsData;

    try {
        rawWsData = await httpGetJson(wsCredsUrl, apiKey);
        const attr = rawWsData?.attributes || rawWsData?.data?.attributes || {};
        token = attr.token;
        socketUrl = attr.socket;
    } catch (err) {
        return {
            statusCode: 200, // Return 200 with diagnostic info so we can see what failed
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                logs: [],
                debug: {
                    step: 'get_ws_credentials',
                    error: err.message,
                    url: wsCredsUrl
                }
            })
        };
    }

    if (!token || !socketUrl) {
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                logs: [],
                debug: {
                    step: 'parse_ws_credentials',
                    error: 'No token or socket URL in response',
                    raw: rawWsData,
                    socketUrl,
                    hasToken: !!token
                }
            })
        };
    }

    // Step 2: Connect via native WebSocket (no external deps)
    let wsResult;
    try {
        wsResult = await collectLogsNative(socketUrl, token, 5000);
    } catch (err) {
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                logs: [],
                debug: {
                    step: 'websocket_connect',
                    error: err.message,
                    socketUrl
                }
            })
        };
    }

    return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            logs: wsResult.logs,
            debug: { socketUrl, logsCount: wsResult.logs.length, wsError: wsResult.error || null }
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
                        } catch {}
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
 * WebSocket client using only Node.js built-in net/tls/crypto modules.
 */
function collectLogsNative(socketUrl, token, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const logs = [];
        let finished = false;
        let error = null;
        let buffer = Buffer.alloc(0);
        let wsHandshakeDone = false;
        let httpResponseBuf = '';

        const finish = (err = null) => {
            if (finished) return;
            finished = true;
            error = err;
            try { socket.destroy(); } catch {}
            resolve({ logs, error: err?.message || null });
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
        const path = parsedUrl.pathname + (parsedUrl.search || '');

        // Generate WebSocket key
        const { createHash, randomBytes } = await import('crypto');
        const wsKey = randomBytes(16).toString('base64');

        const upgradeRequest = [
            `GET ${path} HTTP/1.1`,
            `Host: ${host}:${port}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Key: ${wsKey}`,
            `Sec-WebSocket-Version: 13`,
            `\r\n`
        ].join('\r\n');

        const onData = (chunk) => {
            if (!wsHandshakeDone) {
                httpResponseBuf += chunk.toString('binary');
                const headerEnd = httpResponseBuf.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;

                if (!httpResponseBuf.startsWith('HTTP/1.1 101')) {
                    clearTimeout(deadline);
                    return finish(new Error(`WS Handshake failed: ${httpResponseBuf.substring(0, 80)}`));
                }

                wsHandshakeDone = true;
                const consumed = headerEnd + 4;
                const remaining = chunk.slice(chunk.length - (httpResponseBuf.length - consumed));
                buffer = remaining;
                sendWsFrame(socket, JSON.stringify({ event: 'auth', args: [token] }));
            } else {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // Parse WebSocket frames
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
                            sendWsFrame(socket, JSON.stringify({ event: 'send logs', args: [] }));
                        } else if (msg.event === 'console output') {
                            const rawLog = msg.args?.[0] || '';
                            const clean = rawLog.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
                            if (clean) logs.push(clean);
                        }
                    } catch {}
                } else if (opcode === 8) {
                    clearTimeout(deadline);
                    finish();
                }
            }
        };

        let socket;
        try {
            const { createConnection } = await import('net');
            const { connect: tlsConnect } = await import('tls');

            if (isSecure) {
                socket = tlsConnect({ host, port, rejectUnauthorized: false }, () => {
                    socket.write(upgradeRequest);
                });
            } else {
                socket = createConnection({ host, port }, () => {
                    socket.write(upgradeRequest);
                });
            }

            socket.setTimeout(timeoutMs);
            socket.on('data', onData);
            socket.on('timeout', () => { clearTimeout(deadline); finish(); });
            socket.on('error', (e) => { clearTimeout(deadline); finish(e); });
            socket.on('close', () => { clearTimeout(deadline); finish(); });
        } catch (e) {
            clearTimeout(deadline);
            resolve({ logs, error: `Socket setup error: ${e.message}` });
        }
    });
}

function sendWsFrame(socket, text) {
    try {
        const payload = Buffer.from(text, 'utf8');
        const len = payload.length;
        let header;

        if (len < 126) {
            header = Buffer.alloc(2);
            header[0] = 0x81;
            header[1] = len;
        } else if (len < 65536) {
            header = Buffer.alloc(4);
            header[0] = 0x81;
            header[1] = 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.alloc(10);
            header[0] = 0x81;
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(len), 2);
        }

        socket.write(Buffer.concat([header, payload]));
    } catch {}
}
