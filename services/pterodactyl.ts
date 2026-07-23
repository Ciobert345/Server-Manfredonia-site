import { MCSSServer, MCSSStats } from './mcss';

const DEFAULT_BASE_URL = 'https://panel.example.com';
const SILENT_ERRORS = false;

// Minecraft server address used for the "Server List Ping" player-count query.
// This is independent of the Pterodactyl Panel/Wings addresses.
const MC_SERVER_HOST = 'server-manfredonia.ddns.net';
const MC_SERVER_PORT = 25565;

export interface PterodactylWebsocketData {
    token: string;
    socket: string;
}

// 0 = offline, 1 = running/online, 3 = starting, 4 = stopping
function mapCurrentState(state: string | undefined): number {
    if (state === 'offline') return 0;
    if (state === 'running') return 1;
    if (state === 'starting') return 3;
    if (state === 'stopping') return 4;
    return 1; // unknown -> assume online rather than flashing offline
}

export class PterodactylService {
    private baseUrl: string;
    private apiKey: string;

    private consoleLogsMap = new Map<string, string[]>();
    private lastPolledAt = new Map<string, number>();
    private wsCredsCache = new Map<string, { token: string; socket: string }>();

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
                    statusCode = mapCurrentState(resData?.attributes?.current_state);
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

            const state = attributes.current_state;
            const status = mapCurrentState(state);

            let onlinePlayers = 0;
            let maxPlayers = 0;
            // Only worth pinging the Minecraft process once it's actually running —
            // during starting/stopping/offline it won't respond anyway, so skip it
            // to avoid an unnecessary timeout on every poll during those states.
            if (status === 1) {
                try {
                    const mcResponse = await fetch('/.netlify/functions/pterodactyl-mcstatus', {
                        method: 'GET',
                        headers: {
                            'mc-host': MC_SERVER_HOST,
                            'mc-port': String(MC_SERVER_PORT),
                        },
                    });
                    if (mcResponse.ok) {
                        const mcData = await mcResponse.json();
                        onlinePlayers = mcData?.onlinePlayers ?? 0;
                        maxPlayers = mcData?.maxPlayers ?? 0;
                    }
                } catch {
                    // Minecraft server unreachable — fall back to 0/0 silently,
                    // the CPU/RAM/uptime stats above are still valid and returned.
                }
            }

            return {
                cpuUsage: cpuUsage,
                ramUsage: memoryMb > 0 ? Math.min(100, Math.round((memoryMb / 4096) * 100)) : 0,
                onlinePlayers,
                maxPlayers,
                uptime: formattedUptime,
                status, // 0=offline, 1=running, 3=starting, 4=stopping — add this field to MCSSStats if not already present
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

        // Throttle: only poll every 1.5 seconds max. Safe because the WS token
        // is cached (no rate-limited Panel call on most polls) and each call now
        // returns as soon as output stops flowing, not after a fixed wait.
        const lastPoll = this.lastPolledAt.get(serverId) || 0;
        if (Date.now() - lastPoll < 1500) {
            return (this.consoleLogsMap.get(serverId) || []).slice(-amountOfLines);
        }
        this.lastPolledAt.set(serverId, Date.now());

        const cleanKey = this.apiKey.replace(/^Bearer\s+/i, '');

        if (!isNative) {
            // Web: use the Netlify Function to open WebSocket server-side
            try {
                const cached = this.wsCredsCache.get(serverId);
                const headers: Record<string, string> = {
                    'pterodactyl-base-url': this.baseUrl,
                    'pterodactyl-api-key': cleanKey,
                    'pterodactyl-server-id': serverId,
                };
                if (cached) {
                    headers['pterodactyl-ws-token'] = cached.token;
                    headers['pterodactyl-ws-socket'] = cached.socket;
                }

                const response = await fetch('/.netlify/functions/pterodactyl-console', {
                    method: 'GET',
                    headers,
                });

                if (response.ok) {
                    const data = await response.json();

                    // Cache the credentials for the next poll, unless the function
                    // told us the cached ones had expired (needsRefresh) — in that
                    // case drop the cache so the very next poll fetches a fresh token.
                    if (data?.needsRefresh) {
                        this.wsCredsCache.delete(serverId);
                    } else if (data?.wsToken && data?.wsSocket) {
                        this.wsCredsCache.set(serverId, { token: data.wsToken, socket: data.wsSocket });
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