import http from 'http';
import https from 'https';
import { WebSocket } from 'ws';

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
            body: JSON.stringify({ error: 'Missing required headers: pterodactyl-base-url, pterodactyl-api-key, pterodactyl-server-id' })
        };
    }

    // Step 1: Get WebSocket credentials via REST (server-side, no Mixed Content issues)
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

    // Step 2: Open WebSocket from Node.js and collect logs for up to 4 seconds
    const logs = await collectLogsFromWebSocket(socketUrl, token, 4000);

    return {
        statusCode: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs })
    };
};

// Fetches JSON from Pterodactyl REST API (Node.js HTTP, not browser fetch — no Mixed Content!)
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
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

// Opens a WebSocket connection from Node.js to Pterodactyl and collects console output
function collectLogsFromWebSocket(socketUrl, token, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const logs = [];
        let settled = false;

        const finish = () => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch {}
            resolve(logs);
        };

        const timer = setTimeout(finish, timeoutMs);

        let ws;
        try {
            ws = new WebSocket(socketUrl, { rejectUnauthorized: false });
        } catch (err) {
            clearTimeout(timer);
            resolve(logs);
            return;
        }

        ws.on('open', () => {
            try {
                ws.send(JSON.stringify({ event: 'auth', args: [token] }));
            } catch {}
        });

        ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (parsed.event === 'auth success') {
                    ws.send(JSON.stringify({ event: 'send logs', args: [] }));
                } else if (parsed.event === 'console output') {
                    const rawLog = parsed.args?.[0] || '';
                    // Strip ANSI escape codes
                    const clean = rawLog.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
                    if (clean) logs.push(clean);
                }
            } catch {}
        });

        ws.on('error', () => {
            clearTimeout(timer);
            finish();
        });

        ws.on('close', () => {
            clearTimeout(timer);
            finish();
        });
    });
}
