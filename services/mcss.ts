
export interface MCSSServer {
    serverId: string;
    status: number;
    name: string;
    description: string;
    type: string;
}

export interface MCSSStats {
    cpuUsage: number;
    ramUsage: number;
    onlinePlayers: number;
    maxPlayers: number;
    uptime: string;
}

const DEFAULT_BASE_URL = 'https://server-manfredonia.ddns.net:25560';
const SILENT_ERRORS = true; // Set to true to suppress repetitive fetch timeout logs in console

export class MCSSService {
    private baseUrl: string;
    private apiKey: string;

    constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        // console.log(`[MCSS] Service initialized via Netlify Proxy. Target: ${this.baseUrl}`);
    }

    private async fetchApi(endpoint: string, options: RequestInit = {}) {
        const targetUrl = `${this.baseUrl}${endpoint}`;

        // Detect Native (Capacitor) environment
        const isNative = (window as any).Capacitor?.isNative ||
            (window as any).Capacitor?.isNativePlatform?.() ||
            window.location.protocol === 'static-rocket:' ||
            window.location.protocol === 'capacitor:';

        try {
            if (isNative) {
                // [NATIVE BYPASS] Use CapacitorHttp for absolute targetUrl
                // This bypasses CORS and allows for more robust SSL handling
                try {
                    const { CapacitorHttp } = await import('@capacitor/core');
                    const response = await CapacitorHttp.request({
                        url: targetUrl,
                        method: options.method || 'GET',
                        headers: {
                            'apiKey': this.apiKey,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        data: options.body ? JSON.parse(options.body as string) : undefined,
                        connectTimeout: 15000,
                        readTimeout: 15000,
                    });

                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(response.data?.error || `MCSS Error: ${response.status}`);
                    }

                    return response.data || {};
                } catch (cHttpErr) {
                    // Fallback to fetch if CapacitorHttp fails or isn't available
                    const response = await fetch(targetUrl, {
                        method: options.method || 'GET',
                        headers: {
                            'apiKey': this.apiKey,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        body: options.body,
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `MCSS Error: ${response.status}`);
                    }

                    const text = await response.text();
                    return text ? JSON.parse(text) : {};
                }
            } else {
                // [WEB PROXY] Use relative Netlify bridge
                const response = await fetch('/.netlify/functions/mcss-proxy', {
                    method: options.method || 'GET',
                    headers: {
                        'mcss-target-url': targetUrl,
                        'mcss-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                    body: options.body,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `Proxy Error: ${response.status}`);
                }

                const text = await response.text();
                return text ? JSON.parse(text) : {};
            }
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error(`[MCSS] Proxy fetch failed for ${targetUrl}:`, err.message);
            }
            throw err;
        }
    }

    async getServers(): Promise<MCSSServer[]> {
        try {
            const data = await this.fetchApi('/api/v2/servers');
            return Array.isArray(data) ? data : [];
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error('[MCSS] getServers failed:', err.message || err);
            }
            throw err;
        }
    }

    async getConsole(serverId: string, amountOfLines: number = 50): Promise<string[]> {
        try {
            const data = await this.fetchApi(`/api/v2/servers/${serverId}/console?amountOfLines=${amountOfLines}`);
            return Array.isArray(data) ? data : [];
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error('[MCSS] getConsole failed:', err.message || err);
            }
            throw err;
        }
    }

    async executeCommand(serverId: string, command: string): Promise<void> {
        return this.fetchApi(`/api/v2/servers/${serverId}/execute/command`, {
            method: 'POST',
            body: JSON.stringify({ command }),
        });
    }

    async getServerStats(serverId: string): Promise<MCSSStats> {
        try {
            const data = await this.fetchApi(`/api/v2/servers/${serverId}/stats`);

            // Some versions return an array of history, some return an object with 'latest', some return the object directly
            const statsObj = Array.isArray(data) ? data[data.length - 1] : data;

            const latest = statsObj?.latest || {};
            const root = statsObj || {};

            const get = (...keys: string[]) => {
                for (const key of keys) {
                    if (latest[key] !== undefined) return latest[key];
                    if (root[key] !== undefined) return root[key];
                    // Case-insensitive check
                    const findKey = (obj: any, k: string) => {
                        const lowK = k.toLowerCase();
                        const found = Object.keys(obj).find(ok => ok.toLowerCase() === lowK);
                        return found ? obj[found] : undefined;
                    };
                    const fkLatest = findKey(latest, key);
                    if (fkLatest !== undefined) return fkLatest;
                    const fkRoot = findKey(root, key);
                    if (fkRoot !== undefined) return fkRoot;
                }
                return undefined;
            };

            const memUsed = get('memoryUsed', 'ramUsage', 'Memory', 'RAM', 'ram', 'memory');
            const memLimit = get('memoryLimit', 'maxMemory', 'TotalMemory', 'maxRam', 'memoryLimit');

            const rawUptime = get('uptime', 'upTime', 'up_time', 'timeRunning', 'runningTime', 'uptime_seconds', 'UptimeSeconds');
            let formattedUptime = '00:00:00';

            if (typeof rawUptime === 'number') {
                const hours = Math.floor(rawUptime / 3600);
                const minutes = Math.floor((rawUptime % 3600) / 60);
                const seconds = rawUptime % 60;
                formattedUptime = [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
            } else if (typeof rawUptime === 'string') {
                formattedUptime = rawUptime;
            }

            return {
                cpuUsage: get('cpu', 'cpuUsage', 'CPU', 'cpu_usage') ?? 0,
                ramUsage: (typeof memLimit === 'number' && memLimit > 0 && typeof memUsed === 'number')
                    ? Math.round((memUsed / memLimit) * 100)
                    : (Number(get('ramUsage', 'ram', 'memoryUsage', 'memory_usage')) || 0),
                onlinePlayers: get('playersOnline', 'onlinePlayers', 'OnlinePlayers', 'PlayersOnline', 'players') ?? 0,
                maxPlayers: get('playerLimit', 'maxPlayers', 'MaxPlayers', 'PlayerLimit', 'max_players') ?? 0,
                uptime: formattedUptime
            };
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error('[MCSS] getServerStats failed:', err.message || err);
            }
            throw err;
        }
    }

    async executeAction(serverId: string, action: string | number): Promise<void> {
        const actionMap: { [key: string]: number } = {
            'Stop': 1,
            'Start': 2,
            'Kill': 3,
            'Restart': 4
        };
        const actionId = typeof action === 'string' ? actionMap[action] || action : action;

        return this.fetchApi(`/api/v2/servers/${serverId}/execute/action`, {
            method: 'POST',
            body: JSON.stringify({ action: actionId }),
        });
    }
}
