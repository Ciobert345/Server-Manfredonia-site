import { MCSSServer, MCSSStats } from './mcss';

const DEFAULT_BASE_URL = 'https://panel.example.com';
const SILENT_ERRORS = true;

export interface PterodactylWebsocketData {
    token: string;
    socket: string;
}

export class PterodactylService {
    private baseUrl: string;
    private apiKey: string;

    constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    private async fetchApi(endpoint: string, options: RequestInit = {}) {
        const targetUrl = `${this.baseUrl}${endpoint}`;

        const isNative = (window as any).Capacitor?.isNative ||
            (window as any).Capacitor?.isNativePlatform?.() ||
            window.location.protocol === 'static-rocket:' ||
            window.location.protocol === 'capacitor:';

        const authHeader = this.apiKey.startsWith('Bearer ') ? this.apiKey : `Bearer ${this.apiKey}`;

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
                // Web Proxy via Netlify Function
                const response = await fetch('/.netlify/functions/pterodactyl-proxy', {
                    method: options.method || 'GET',
                    headers: {
                        'pterodactyl-target-url': targetUrl,
                        'pterodactyl-api-key': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                    body: options.body,
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData?.errors?.[0]?.detail || errorData.error || `Proxy Error: ${response.status}`);
                }

                const text = await response.text();
                return text ? JSON.parse(text) : {};
            }
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error(`[PTERODACTYL] Proxy fetch failed for ${targetUrl}:`, err.message);
            }
            throw err;
        }
    }

    async getServers(): Promise<MCSSServer[]> {
        try {
            const data = await this.fetchApi('/api/client');
            const items = data?.data || [];

            // Fetch resources status for each server to map online/offline status correctly
            const serverPromises = items.map(async (item: any) => {
                const attr = item.attributes || {};
                const identifier = attr.identifier || attr.uuid || '';

                let statusCode = 1; // Default to online
                try {
                    const resData = await this.fetchApi(`/api/client/servers/${identifier}/resources`);
                    const state = resData?.attributes?.current_state;
                    // Map state to MCSS status code format (0: OFFLINE, 1: ONLINE, 2: RESTARTING, 3: STARTING, 4: STOPPING)
                    if (state === 'offline') statusCode = 0;
                    else if (state === 'running') statusCode = 1;
                    else if (state === 'starting') statusCode = 3;
                    else if (state === 'stopping') statusCode = 4;
                } catch {
                    // Ignore individual resource status check errors
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
            // Pterodactyl doesn't always send max memory in resources; calculate or default to percentage
            const cpuUsage = Math.round((resources.cpu_absolute || 0) * 10) / 10;
            const memoryMb = Math.round(memoryBytes / (1024 * 1024));

            const rawUptime = Math.floor((resources.uptime || 0) / 1000); // Uptime is in milliseconds in Pterodactyl client resources
            let formattedUptime = '00:00:00';
            if (rawUptime > 0) {
                const hours = Math.floor(rawUptime / 3600);
                const minutes = Math.floor((rawUptime % 3600) / 60);
                const seconds = rawUptime % 60;
                formattedUptime = [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
            }

            return {
                cpuUsage: cpuUsage,
                ramUsage: memoryMb > 0 ? Math.min(100, Math.round((memoryMb / 4096) * 100)) : 0, // Fallback RAM % estimation
                onlinePlayers: 0, // Fallback to mcsrvstat for player count
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
        return this.fetchApi(`/api/client/servers/${serverId}/command`, {
            method: 'POST',
            body: JSON.stringify({ command }),
        });
    }

    async getConsole(serverId: string, amountOfLines: number = 50): Promise<string[]> {
        // Pterodactyl uses WebSockets for live console streaming.
        // Returns a placeholder instruction if fetched via REST polling.
        return [
            `[Pterodactyl Console Connected to ${serverId}]`,
            `Use executeCommand to send commands directly to the server.`
        ];
    }

    async getWebsocketToken(serverId: string): Promise<PterodactylWebsocketData> {
        const data = await this.fetchApi(`/api/client/servers/${serverId}/ws`);
        return {
            token: data?.data?.token || '',
            socket: data?.data?.socket || ''
        };
    }
}
