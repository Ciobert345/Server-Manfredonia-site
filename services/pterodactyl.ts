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
    private lastPolledAt = new Map<string, number>();

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
        // Optimistically append command to logs so user sees it in terminal
        const current = this.consoleLogsMap.get(serverId) || [];
        this.consoleLogsMap.set(serverId, [...current, `> [EXEC]: ${command}`].slice(-200));

        return this.fetchApi(`/api/client/servers/${serverId}/command`, {
            method: 'POST',
            body: JSON.stringify({ command }),
        });
    }

    /**
     * Polls console logs via the Netlify Function pterodactyl-console,
     * which opens the WebSocket server-side (no browser Mixed Content issues).
     * Falls back to cached logs on error.
     */
    async getConsole(serverId: string, amountOfLines: number = 50): Promise<string[]> {
        if (!this.consoleLogsMap.has(serverId)) {
            this.consoleLogsMap.set(serverId, [
                `[Pterodactyl Console: connecting to ${serverId}...]`,
            ]);
        }

        const isNative = (window as any).Capacitor?.isNative ||
            (window as any).Capacitor?.isNativePlatform?.() ||
            window.location.protocol === 'static-rocket:' ||
            window.location.protocol === 'capacitor:';

        // Throttle: only poll every 5 seconds max
        const lastPoll = this.lastPolledAt.get(serverId) || 0;
        if (Date.now() - lastPoll < 5000) {
            return (this.consoleLogsMap.get(serverId) || []).slice(-amountOfLines);
        }
        this.lastPolledAt.set(serverId, Date.now());

        const cleanKey = this.apiKey.replace(/^Bearer\s+/i, '');

        if (!isNative) {
            // Web: use the Netlify Function to open WebSocket server-side
            try {
                const response = await fetch('/.netlify/functions/pterodactyl-console', {
                    method: 'GET',
                    headers: {
                        'pterodactyl-base-url': this.baseUrl,
                        'pterodactyl-api-key': cleanKey,
                        'pterodactyl-server-id': serverId,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    // Always log debug info to help diagnose issues
                    if (data?.debug) {
                        console.info('[PTERODACTYL CONSOLE DEBUG]', JSON.stringify(data.debug));
                    }
                    const newLogs: string[] = data?.logs || [];
                    if (newLogs.length > 0) {
                        const existing = this.consoleLogsMap.get(serverId) || [];
                        const merged = [
                            ...existing.filter(l => l.startsWith('> [EXEC]:')),
                            ...newLogs
                        ].slice(-200);
                        this.consoleLogsMap.set(serverId, merged);
                    }
                } else {
                    console.error('[PTERODACTYL CONSOLE] Function returned HTTP', response.status);
                    const text = await response.text().catch(() => '');
                    console.error('[PTERODACTYL CONSOLE] Body:', text.substring(0, 300));
                }
            } catch (e: any) {
                if (!SILENT_ERRORS) {
                    console.warn('[PTERODACTYL] Console poll failed:', e.message || e);
                }
            }
        }

        const logs = this.consoleLogsMap.get(serverId) || [];
        return logs.slice(-amountOfLines);
    }

    async getWebsocketToken(serverId: string): Promise<PterodactylWebsocketData> {
        const data = await this.fetchApi(`/api/client/servers/${serverId}/websocket`);
        const attr = data?.attributes || data?.data?.attributes || {};
        return {
            token: attr.token || '',
            socket: attr.socket || ''
        };
    }
}
