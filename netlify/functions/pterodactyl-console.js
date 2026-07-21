import http from 'http';
import https from 'https';
import net from 'net';
import tls from 'tls';
import crypto from 'crypto';

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
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Missing required headers' })
        };
    }

    // Step 1: Get WebSocket credentials via REST
    const wsCredsUrl = `${baseUrl}/api/client/servers/${serverId}/websocket`;
    let token, socketUrl;

    try {
        const wsData = await httpGetJson(wsCredsUrl, apiKey);
        const attr = wsData?.attributes || wsData?.data?.attributes || {};
        token = attr.token;
        socketUrl = attr.socket;

        if (!token || !socketUrl) {
            return {
                statusCode: 502,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Pterodactyl did not return websocket credentials', raw: wsData })
            };
        }
    } catch (err) {
        return {
            statusCode: 502,
            headers: corsHeaders,
            body: JSON.stringify({ error: `Failed to get WS credentials: ${err.message}` })
        };
    }

    // Step 2: Connect WebSocket using Node.js native net/tls (no external dependencies)
    const logs = await collectLogsNative(socketUrl, token, 5000);

    return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs })
    };
};

function httpGetJson(url, apiKey) {
    return new Promise((resolve, reject) => {
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
            timeout: 10000
        };

        const req = transport.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve({}); }
                } else {
                    try {
                        const errData = JSON.parse(data);
                        const detail = errData?.errors?.[0]?.detail || errData?.error || `HTTP ${res.statusCode}`;
                        reject(new Error(detail));
                    } catch {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('HTTP Timeout')); });
        req.end();
    });
}

/**
 * WebSocket client using only Node.js built-in net/tls modules.
 * No external dependencies required.
 */
function collectLogsNative(socketUrl, token, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const logs = [];
        let finished = false;
        let buffer = Buffer.alloc(0);

        const finish = () => {
            if (finished) return;
            finished = true;
            try { socket.destroy(); } catch {}
            resolve(logs);
        };

        const deadline = setTimeout(finish, timeoutMs);

        // Parse the ws:// or wss:// URL
        let parsedUrl;
        try {
            parsedUrl = new URL(socketUrl);
        } catch {
            clearTimeout(deadline);
            return resolve(logs);
        }

        const isSecure = parsedUrl.protocol === 'wss:';
        const host = parsedUrl.hostname;
        const port = parseInt(parsedUrl.port) || (isSecure ? 443 : 80);
        const path = parsedUrl.pathname + (parsedUrl.search || '');

        // Generate WebSocket upgrade key
        const wsKey = crypto.randomBytes(16).toString('base64');

        const upgradeRequest = [
            `GET ${path} HTTP/1.1`,
            `Host: ${host}:${port}`,
            `Upgrade: websocket`,
            `Connection: Upgrade`,
            `Sec-WebSocket-Key: ${wsKey}`,
            `Sec-WebSocket-Version: 13`,
            `\r\n`
        ].join('\r\n');

        let socket;
        let wsHandshakeDone = false;
        let httpHeadersDone = false;
        let httpResponseBuf = '';

        const onConnect = () => {
            socket.write(upgradeRequest);
        };

        const onData = (chunk) => {
            if (!wsHandshakeDone) {
                httpResponseBuf += chunk.toString('binary');
                const headerEnd = httpResponseBuf.indexOf('\r\n\r\n');
                if (headerEnd === -1) return;

                // Check for 101 Switching Protocols
                if (!httpResponseBuf.startsWith('HTTP/1.1 101')) {
                    clearTimeout(deadline);
                    return finish();
                }

                wsHandshakeDone = true;
                const remaining = chunk.slice(chunk.length - (httpResponseBuf.length - headerEnd - 4));
                buffer = remaining;

                // Send auth event
                sendWsFrame(socket, JSON.stringify({ event: 'auth', args: [token] }));
            } else {
                buffer = Buffer.concat([buffer, chunk]);
            }

            // Parse WebSocket frames from buffer
            while (buffer.length >= 2) {
                const firstByte = buffer[0];
                const secondByte = buffer[1];
                const isFinalFrame = !!(firstByte & 0x80);
                const opcode = firstByte & 0x0f;
                const isMasked = !!(secondByte & 0x80);
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

                if (isMasked) offset += 4;
                if (buffer.length < offset + payloadLength) break;

                const payload = buffer.slice(offset, offset + payloadLength);
                buffer = buffer.slice(offset + payloadLength);

                // opcode 1 = text frame
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
                    // Close frame
                    clearTimeout(deadline);
                    finish();
                }
            }
        };

        try {
            if (isSecure) {
                socket = tls.connect({ host, port, rejectUnauthorized: false }, onConnect);
            } else {
                socket = net.connect({ host, port }, onConnect);
            }

            socket.on('data', onData);
            socket.on('error', () => { clearTimeout(deadline); finish(); });
            socket.on('close', () => { clearTimeout(deadline); finish(); });
        } catch {
            clearTimeout(deadline);
            resolve(logs);
        }
    });
}

/**
 * Sends a WebSocket text frame (unmasked, as server receives it).
 */
function sendWsFrame(socket, text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;

    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text opcode
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

    try {
        socket.write(Buffer.concat([header, payload]));
    } catch {}
}
