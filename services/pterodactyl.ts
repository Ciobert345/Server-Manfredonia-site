import { MCSSServer, MCSSStats } from './mcss';

const DEFAULT_BASE_URL = 'https://server-manfredonia.duckdns.org:25443';
const SILENT_ERRORS = false;

// Minecraft server address used for the "Server List Ping" player-count query.
const MC_SERVER_HOST = 'server-manfredonia.ddns.net';
const MC_SERVER_PORT = 25565;

export interface PterodactylWebsocketData {
    token: string;
    socket: string;
}

// 0 = offline, 1 = running/online, 2 = restarting, 3 = starting, 4 = stopping
function mapCurrentState(state: string | number | undefined): number {
    if (typeof state === 'number') return state;
    if (typeof state === 'string') {
        const s = state.toLowerCase().trim();
        if (s.includes('starting')) return 3;
        if (s.includes('stopping')) return 4;
        if (s.includes('restarting')) return 2;
        if (s.includes('running') || s.includes('online') || s.includes('started')) return 1;
        if (s.includes('offline') || s.includes('stopped')) return 0;
    }
    return 0;
}

export class PterodactylService {
    private baseUrl: string;
    private apiKey: string;

    private consoleLogsMap = new Map<string, string[]>();
    // Browser WebSocket connections (one per server, persistent)
    private wsConnections = new Map<string, WebSocket>();
    // WS token cache: avoid requesting a new token on every reconnect
    private wsTokenCache = new Map<string, { token: string; socket: string; expiresAt: number }>();

    constructor(apiKey: string, baseUrl: string = DEFAULT_BASE_URL) {
        this.apiKey = apiKey ? apiKey.trim() : '';

        let cleanUrl = baseUrl ? baseUrl.trim() : DEFAULT_BASE_URL;
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        if (cleanUrl.endsWith('/api/client')) cleanUrl = cleanUrl.slice(0, -11);
        if (cleanUrl.endsWith('/api')) cleanUrl = cleanUrl.slice(0, -4);
        this.baseUrl = cleanUrl;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core fetch helper – direct HTTPS, no Netlify proxy needed
    // ─────────────────────────────────────────────────────────────────────────
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
                // Native: try CapacitorHttp (bypasses CORS), fall back to fetch
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
                } catch {
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
                // Web: direct HTTPS fetch — CORS headers are now configured on Nginx.
                // Zero Netlify function invocations for REST calls.
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

    // ─────────────────────────────────────────────────────────────────────────
    // Server list
    // ─────────────────────────────────────────────────────────────────────────
    async getServers(): Promise<MCSSServer[]> {
        try {
            const data = await this.fetchApi('/api/client');
            const items = data?.data || (Array.isArray(data) ? data : []);

            const serverPromises = items.map(async (item: any) => {
                const attr = item?.attributes || item?.data?.attributes || item || {};
                const identifier = attr.identifier || attr.uuid || item.id || '';

                let statusCode = 0;
                try {
                    const resData = await this.fetchApi(`/api/client/servers/${identifier}/resources`);
                    const resAttr = resData?.attributes || resData?.data?.attributes || resData?.data || resData || {};
                    statusCode = mapCurrentState(resAttr.current_state || resAttr.state);
                } catch {
                    // ignore per-server resource error
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

    // ─────────────────────────────────────────────────────────────────────────
    // Server stats
    // ─────────────────────────────────────────────────────────────────────────
    async getServerStats(serverId: string): Promise<MCSSStats> {
        try {
            const data = await this.fetchApi(`/api/client/servers/${serverId}/resources`);
            const attributes = data?.attributes || data?.data?.attributes || data?.data || data || {};
            const resources = attributes.resources || data?.resources || {};

            const memoryBytes = resources.memory_bytes ?? attributes.memory_bytes ?? 0;
            const cpuUsage = Math.round((resources.cpu_absolute ?? attributes.cpu_absolute ?? 0) * 10) / 10;
            const memoryMb = Math.round(memoryBytes / (1024 * 1024));

            const rawUptime = Math.floor((resources.uptime ?? attributes.uptime ?? 0) / 1000);
            let formattedUptime = '00:00:00';
            if (rawUptime > 0) {
                const hours = Math.floor(rawUptime / 3600);
                const minutes = Math.floor((rawUptime % 3600) / 60);
                const seconds = rawUptime % 60;
                formattedUptime = [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
            }

            const state = attributes.current_state || attributes.state || data?.current_state || data?.state;
            const status = mapCurrentState(state);

            let onlinePlayers = 0;
            let maxPlayers = 0;
            let isMcOnline = false;

            // MC status: only call Netlify function if the panel server is running.
            // This is the only remaining Netlify function call (player count via SLP).
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
                        isMcOnline = !!mcData?.online;
                        onlinePlayers = mcData?.onlinePlayers ?? 0;
                        maxPlayers = mcData?.maxPlayers ?? 0;
                    }
                } catch {
                    isMcOnline = false;
                }
            }

            return {
                cpuUsage,
                ramUsage: memoryMb > 0 ? Math.min(100, Math.round((memoryMb / 4096) * 100)) : 0,
                onlinePlayers,
                maxPlayers,
                uptime: formattedUptime,
                status,
                isMcOnline
            };
        } catch (err: any) {
            if (!SILENT_ERRORS) {
                console.error('[PTERODACTYL] getServerStats failed:', err.message || err);
            }
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Power actions
    // ─────────────────────────────────────────────────────────────────────────
    async executeAction(serverId: string, action: string | number): Promise<void> {
        const actionMap: { [key: string]: string } = {
            'Stop': 'stop', 'Start': 'start', 'Kill': 'kill', 'Restart': 'restart',
            '1': 'stop', '2': 'start', '3': 'kill', '4': 'restart'
        };
        const signal = typeof action === 'string'
            ? (actionMap[action] || action.toLowerCase())
            : (actionMap[String(action)] || 'restart');

        return this.fetchApi(`/api/client/servers/${serverId}/power`, {
            method: 'POST',
            body: JSON.stringify({ signal }),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Console command
    // ─────────────────────────────────────────────────────────────────────────
    async executeCommand(serverId: string, command: string): Promise<void> {
        // Optimistically append so user sees their command immediately
        const current = this.consoleLogsMap.get(serverId) || [];
        this.consoleLogsMap.set(serverId, [...current, `> [EXEC]: ${command}`].slice(-200));

        return this.fetchApi(`/api/client/servers/${serverId}/command`, {
            method: 'POST',
            body: JSON.stringify({ command }),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Console logs – persistent WebSocket (web) or Netlify poll (native)
    //
    // Web: opens ONE WebSocket per server and keeps it alive.
    //      getConsole() just returns the local cache — zero extra network calls.
    // Native: no browser WS available, falls back to the Netlify function poll.
    // ─────────────────────────────────────────────────────────────────────────
    private useNetlifyConsoleFallback = new Map<string, boolean>();

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

        if (!isNative && !this.useNetlifyConsoleFallback.get(serverId)) {
            // Try direct browser WebSocket first (0 Netlify calls if successful)
            this.ensureBrowserWebSocket(serverId);
        } else {
            // Fallback to Netlify function (server-to-server connection) if direct WS fails
            await this.pollConsoleViaNativeProxy(serverId);
        }

        return (this.consoleLogsMap.get(serverId) || []).slice(-amountOfLines);
    }

    /**
     * Opens a persistent WebSocket to the Wings server for the given server ID.
     * If the socket is already CONNECTING or OPEN, this is a no-op.
     * Tokens are cached for ~14 minutes to avoid hammering the REST API.
     */
    private lastWsAttemptMap = new Map<string, number>();

    private async ensureBrowserWebSocket(serverId: string): Promise<void> {
        const existing = this.wsConnections.get(serverId);
        if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
            return; // already alive
        }

        // Throttle token fetch attempts to at most once per 10 seconds to avoid 429 Too Many Requests
        const lastAttempt = this.lastWsAttemptMap.get(serverId) || 0;
        if (Date.now() - lastAttempt < 10000) {
            return;
        }

        // Resolve WS credentials (token + socket URL)
        let wsToken: string;
        let wsSocket: string;

        const cached = this.wsTokenCache.get(serverId);
        if (cached && Date.now() < cached.expiresAt) {
            wsToken = cached.token;
            wsSocket = cached.socket;
        } else {
            this.lastWsAttemptMap.set(serverId, Date.now());
            try {
                const wsData = await this.getWebsocketToken(serverId);
                wsToken = wsData.token;
                wsSocket = wsData.socket;
                // Pterodactyl tokens expire in ~15 min — refresh 1 min early
                this.wsTokenCache.set(serverId, {
                    token: wsToken,
                    socket: wsSocket,
                    expiresAt: Date.now() + 14 * 60 * 1000,
                });
            } catch (err: any) {
                if (!SILENT_ERRORS) console.warn('[PTERODACTYL WS] Could not get token:', err.message);
                return;
            }
        }

        if (!wsToken || !wsSocket) return;

        const ws = new WebSocket(wsSocket);
        this.wsConnections.set(serverId, ws);

        let authSuccess = false;

        ws.onopen = () => {
            ws.send(JSON.stringify({ event: 'auth', args: [wsToken] }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.event === 'auth success') {
                    authSuccess = true;
                    ws.send(JSON.stringify({ event: 'send logs', args: [] }));
                } else if (msg.event === 'console output') {
                    const rawLog = msg.args?.[0] || '';
                    const clean = rawLog.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
                    if (clean) {
                        const existing = this.consoleLogsMap.get(serverId) || [];
                        const filtered = existing.filter(l => !l.startsWith('[Pterodactyl Console:'));
                        this.consoleLogsMap.set(serverId, [...filtered, clean].slice(-200));
                    }
                } else if (msg.event === 'token expiring' || msg.event === 'token expired') {
                    this.wsTokenCache.delete(serverId);
                    ws.close();
                }
            } catch { }
        };

        ws.onerror = () => {
            console.warn('[PTERODACTYL WS] Direct browser WebSocket error — switching to Netlify proxy fallback');
            this.wsConnections.delete(serverId);
            this.useNetlifyConsoleFallback.set(serverId, true);
        };

        ws.onclose = () => {
            this.wsConnections.delete(serverId);
            if (!authSuccess) {
                console.warn('[PTERODACTYL WS] Direct browser WebSocket closed without auth — switching to Netlify proxy fallback');
                this.useNetlifyConsoleFallback.set(serverId, true);
            }
        };
    }

    /**
     * Native-only fallback: poll logs via the Netlify function.
     * Throttled to 1 call per 5 seconds.
     */
    private lastNativePoll = new Map<string, number>();
    private nativeWsCredsCache = new Map<string, { token: string; socket: string }>();

    private async pollConsoleViaNativeProxy(serverId: string): Promise<void> {
        const lastPoll = this.lastNativePoll.get(serverId) || 0;
        if (Date.now() - lastPoll < 3000) return;
        this.lastNativePoll.set(serverId, Date.now());

        const cleanKey = this.apiKey.replace(/^Bearer\s+/i, '');

        try {
            const cached = this.nativeWsCredsCache.get(serverId);
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
                if (data?.needsRefresh) {
                    this.nativeWsCredsCache.delete(serverId);
                } else if (data?.wsToken && data?.wsSocket) {
                    this.nativeWsCredsCache.set(serverId, { token: data.wsToken, socket: data.wsSocket });
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
            }
        } catch (e: any) {
            if (!SILENT_ERRORS) {
                console.warn('[PTERODACTYL] Native console poll failed:', e.message || e);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WebSocket token REST endpoint
    // ─────────────────────────────────────────────────────────────────────────
    async getWebsocketToken(serverId: string): Promise<PterodactylWebsocketData> {
        const data = await this.fetchApi(`/api/client/servers/${serverId}/websocket`);
        const attr = data?.attributes || data?.data?.attributes || data?.data || {};
        return {
            token: attr.token || '',
            socket: attr.socket || ''
        };
    }

    /**
     * Cleanly close all open WebSocket connections (call this on logout/unmount).
     */
    closeAllWebSockets(): void {
        for (const [, ws] of this.wsConnections) {
            try { ws.close(); } catch { }
        }
        this.wsConnections.clear();
        this.wsTokenCache.clear();
    }
}