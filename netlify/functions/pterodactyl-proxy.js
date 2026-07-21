import https from 'https';
import http from 'http';

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, pterodactyl-target-url, pterodactyl-api-key',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: 'OK' };
    }

    const targetUrl = event.headers['pterodactyl-target-url'] || event.headers['Pterodactyl-Target-Url'];
    const apiKey = event.headers['pterodactyl-api-key'] || event.headers['Pterodactyl-Api-Key'];

    if (!targetUrl) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing pterodactyl-target-url header' }) };
    }

    return new Promise((resolve) => {
        try {
            const url = new URL(targetUrl);
            const isHttps = url.protocol === 'https:';
            const transport = isHttps ? https : http;

            const isVerbose = event.headers['pterodactyl-verbose'] === 'true' || process.env.PTERODACTYL_VERBOSE === 'true';
            if (isVerbose) {
                console.log(`[NETLIFY-PTERODACTYL-BRIDGE] Protocol: ${url.protocol} | Target: ${targetUrl}`);
            }

            const options = {
                method: event.httpMethod,
                headers: {
                    'Authorization': apiKey ? (apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`) : '',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Netlify-Pterodactyl-Bridge/1.0'
                },
                rejectUnauthorized: false, // Essential for self-signed certs
                timeout: 15000
            };

            const req = transport.request(targetUrl, options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    const finalData = data || '{}';
                    resolve({
                        statusCode: res.statusCode,
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: finalData
                    });
                });
            });

            req.on('error', (e) => {
                console.error('[PTERODACTYL BRIDGE ERROR]', e.code, e.message);
                let message = e.message;
                if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED') {
                    message = `Connection ${e.code === 'ECONNRESET' ? 'Reset' : 'Refused'}. Possible causes: 1. Port/Host is not reachable. 2. Firewall is blocking Netlify. Target was ${url.protocol}`;
                }
                resolve({
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({ error: message, code: e.code, details: e.message })
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    statusCode: 504,
                    headers,
                    body: JSON.stringify({ error: "Upstream Timeout" })
                });
            });

            if (event.body) req.write(event.body);
            req.end();

        } catch (err) {
            resolve({
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: "Bridge Config Error: " + err.message })
            });
        }
    });
};
