import https from 'https';
import http from 'http';

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, mcss-target-url, mcss-api-key',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: 'OK' };
    }

    const targetUrl = event.headers['mcss-target-url'] || event.headers['MCSS-Target-Url'];
    const apiKey = event.headers['mcss-api-key'] || event.headers['MCSS-Api-Key'];

    if (!targetUrl) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing mcss-target-url header' }) };
    }

    return new Promise((resolve) => {
        try {
            const url = new URL(targetUrl);
            const isHttps = url.protocol === 'https:';
            const transport = isHttps ? https : http;

            // Only log if explicit verbose flag is provided or via env
            const isVerbose = event.headers['mcss-verbose'] === 'true' || process.env.MCSS_VERBOSE === 'true';
            if (isVerbose) {
                console.log(`[NETLIFY-BRIDGE] Protocol: ${url.protocol} | Target: ${targetUrl}`);
            }

            const options = {
                method: event.httpMethod,
                headers: {
                    'apiKey': apiKey || '',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Netlify-Bridge/1.1'
                },
                rejectUnauthorized: false, // Essential for self-signed certs
                timeout: 15000 // Increased timeout to 15s
            };

            const req = transport.request(targetUrl, options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    const finalData = data || '{}'; // Return empty object string if body is empty
                    resolve({
                        statusCode: res.statusCode,
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: finalData
                    });
                });
            });

            req.on('error', (e) => {
                console.error('[BRIDGE ERROR]', e.code, e.message);
                let message = e.message;
                if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED') {
                    message = `Connection ${e.code === 'ECONNRESET' ? 'Reset' : 'Refused'}. Possible causes: 1. Port 25560 is not open. 2. Firewall is blocking Netlify. 3. Protocol mismatch (trying HTTP on an HTTPS port). Target was ${url.protocol}`;
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
