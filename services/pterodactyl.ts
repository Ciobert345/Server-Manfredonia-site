import { MCSSServer, MCSSStats } from './mcss';

const DEFAULT_BASE_URL = 'https://panel.example.com';
const SILENT_ERRORS = false;

export interface PterodactylWebsocketData {
    token: string;
    socket: string;
}

export class PterodactylService {
    private baseUrl: string;
    private apiKey: string;

    private consoleLogsMap = new Map<string, string[]>();
    private activeSockets = new Map<string, WebSocket>();
    private connectingSockets = new Set<string>();

    constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
        this.apiKey = apiKey ? apiKey.trim() : '';
        
        let cleanUrl = baseUrl ? baseUrl.trim() : DEFAULT_BASE_URL;
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        if (cleanUrl.endsWith('/api/client')) cleanUrl = cleanUrl.slice(0, -11);
        if (cleanUrl.endsWith('/api')) cleanUrl = cleanUrl.slice(0, -4);
        this.baseUrl = cleanUrl;
    }

    private async fetchApi(endpoint: string, options: RequestInit = {}) {
        const targetUrl = `${this.baseUrl}${endpoint}`;

        const isNative = (window as any).Capacitor?.isNative ||
            (window as any).Capacitor?.isNativePlatform?.() ||
            window.location.protocol === 'static-rocket:' ||
            window.location.protocol === 'capacitor:';

        const cleanKey = this.apiKey.replace(/^Bearer\s+/i, '');
        const authHeader = `Bearer ${cleanKey}`;

        try {
            if (isNative) {
                try {
                    const { CapacitorHttp } = await import('@capacitor/core');
                    const response = await CapacitorHttp.request({
                        url: targetUrl,
                        method: options.method || 'GET',
                        headers: {
                            'Authorization': authHeader,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        data: options.body ? JSON.parse(options.body as string) : undefined,
                        connectTimeout: 15000,
                        readTimeout: 15000,
                    });

                    if (response.status < 200 || response.status >= 300) {
                        throw new Error(response.data?.errors?.[0]?.detail || response.data?.error || `Pterodactyl Error: ${response.status}`);
                    }

                    return response.data || {};
                } catch (cHttpErr) {
                    const response = await fetch(targetUrl, {
                        method: options.method || 'GET',
                        headers: {
                            'Authorization': authHeader,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        body: options.body,
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData?.errors?.[0]?.detail || errorData.error || `Pterodactyl Error: ${response.status}`);
                    }

                    const text = await response.text();
                    return text ? JSON.parse(text) : {};
                }
            } else {
                // Web Environment: First attempt Netlify Proxy
                try {
                    const response = await fetch('/.netlify/functions/pterodactyl-proxy', {
                        method: options.method || 'GET',
                        headers: {
                            'pterodactyl-target-url': targetUrl,
                            'pterodactyl-api-key': cleanKey,
                            'Content-Type': 'application/json',
                        },
                        body: options.body,
                    });

                    if (response.ok) {
                        const text = await response.text();
                        return text ? JSON.parse(text) : {};
                    } else if (response.status !== 404) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData?.error || errorData?.errors?.[0]?.detail || `Proxy Error: ${response.status}`);
                    }
                } catch (proxyErr: any) {
                    if (proxyErr.message && !proxyErr.message.includes('404')) {
                        console.warn('[PTERODACTYL] Proxy attempt failed, trying direct fetch:', proxyErr.message);
                    }
                }

                // Fallback: Direct Fetch
                const response = await fetch(targetUrl, {
                    method: options.method || 'GET',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: options.body,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData?.errors?.[0]?.detail || errorData.error || `Pterodactyl Error: ${response.status}`);
                }

                const text = await response.text();
                return text ? JSON.parse(text) : {};
            }
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error(`[PTERODACTYL] Fetch failed for ${targetUrl}:`, err.message || err);
            }
            throw err;
        }
    }

    async getServers(): Promise<MCSSServer[]> {
        try {
            const data = await this.fetchApi('/api/client');
            const items = data?.data || [];

            const serverPromises = items.map(async (item: any) => {
                const attr = item.attributes || {};
                const identifier = attr.identifier || attr.uuid || '';

                let statusCode = 1; // Default to online
                try {
                    const resData = await this.fetchApi(`/api/client/servers/${identifier}/resources`);
                    const state = resData?.attributes?.current_state;
                    if (state === 'offline') statusCode = 0;
                    else if (state === 'running') statusCode = 1;
                    else if (state === 'starting') statusCode = 3;
                    else if (state === 'stopping') statusCode = 4;
                } catch {
                    // Ignore resource check error for single server
                }

                return {
                    serverId: identifier,
                    status: statusCode,
                    name: attr.name || 'Pterodactyl Server',
                    description: attr.description || '',
                    type: 'pterodactyl'
                };
            });

            return await Promise.all(serverPromises);
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error('[PTERODACTYL] getServers failed:', err.message || err);
            }
            throw err;
        }
    }

    async getServerStats(serverId: string): Promise<MCSSStats> {
        try {
            const data = await this.fetchApi(`/api/client/servers/${serverId}/resources`);
            const attributes = data?.attributes || {};
            const resources = attributes.resources || {};

            const memoryBytes = resources.memory_bytes || 0;
            const cpuUsage = Math.round((resources.cpu_absolute || 0) * 10) / 10;
            const memoryMb = Math.round(memoryBytes / (1024 * 1024));

            const rawUptime = Math.floor((resources.uptime || 0) / 1000);
            let formattedUptime = '00:00:00';
            if (rawUptime > 0) {
                const hours = Math.floor(rawUptime / 3600);
                const minutes = Math.floor((rawUptime % 3600) / 60);
                const seconds = rawUptime % 60;
                formattedUptime = [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
            }

            return {
                cpuUsage: cpuUsage,
                ramUsage: memoryMb > 0 ? Math.min(100, Math.round((memoryMb / 4096) * 100)) : 0,
                onlinePlayers: 0,
                maxPlayers: 20,
                uptime: formattedUptime
            };
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error('[PTERODACTYL] getServerStats failed:', err.message || err);
            }
            throw err;
        }
    }

    async executeAction(serverId: string, action: string | number): Promise<void> {
        const actionMap: { [key: string]: string } = {
            'Stop': 'stop',
            'Start': 'start',
            'Kill': 'kill',
            'Restart': 'restart',
            '1': 'stop',
            '2': 'start',
            '3': 'kill',
            '4': 'restart'
        };

        const signal = typeof action === 'string' ? (actionMap[action] || action.toLowerCase()) : (actionMap[String(action)] || 'restart');

        return this.fetchApi(`/api/client/servers/${serverId}/power`, {
            method: 'POST',
            body: JSON.stringify({ signal }),
        });
    }

    async executeCommand(serverId: string, command: string): Promise<void> {
        const ws = this.activeSockets.get(serverId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ event: 'send command', args: [command] }));
            } catch {}
        }
        return this.fetchApi(`/api/client/servers/${serverId}/command`, {
            method: 'POST',
            body: JSON.stringify({ command }),
        });
    }

    private async connectConsoleSocket(serverId: string) {
        if (this.activeSockets.has(serverId) || this.connectingSockets.has(serverId)) return;

        this.connectingSockets.add(serverId);
        try {
            const { token, socket } = await this.getWebsocketToken(serverId);
            if (!token || !socket) {
                this.connectingSockets.delete(serverId);
                return;
            }

            const ws = new WebSocket(socket);
            this.activeSockets.set(serverId, ws);

            ws.onopen = () => {
                ws.send(JSON.stringify({ event: 'auth', args: [token] }));
            };

            ws.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed.event === 'auth success') {
                        ws.send(JSON.stringify({ event: 'send logs', args: [] }));
                    } else if (parsed.event === 'console output') {
                        const rawLog = parsed.args?.[0] || '';
                        const cleanLog = rawLog.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
                        if (cleanLog) {
                            const current = this.consoleLogsMap.get(serverId) || [];
                            const updated = [...current, cleanLog].slice(-200);
                            this.consoleLogsMap.set(serverId, updated);
                        }
                    }
                } catch {}
            };

            ws.onerror = () => {
                this.activeSockets.delete(serverId);
            };

            ws.onclose = () => {
                this.activeSockets.delete(serverId);
            };
        } catch (e) {
            // Socket connection failed
        } finally {
            this.connectingSockets.delete(serverId);
        }
    }

    async getConsole(serverId: string, amountOfLines: number = 50): Promise<string[]> {
        if (!this.consoleLogsMap.has(serverId)) {
            this.consoleLogsMap.set(serverId, [`[Pterodactyl Console Connected to ${serverId}]`]);
        }

        this.connectConsoleSocket(serverId);

        const logs = this.consoleLogsMap.get(serverId) || [];
        return logs.slice(-amountOfLines);
    }

    async getWebsocketToken(serverId: string): Promise<PterodactylWebsocketData> {
        const data = await this.fetchApi(`/api/client/servers/${serverId}/ws`);
        return {
            token: data?.data?.token || '',
            socket: data?.data?.socket || ''
        };
    }
}
