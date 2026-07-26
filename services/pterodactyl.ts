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
    // Console – persistent browser WebSocket (web) / Netlify bridge (native)
    //
    // Web path:
    //   1. One REST call → /api/client/servers/{id}/websocket → (token, socketUrl)
    //   2. socketUrl port is rewritten to the Nginx proxy port so the browser
    //      can connect through the SSL-terminated endpoint (25443 → Wings :8080)
    //   3. A single persistent WebSocket is kept alive per server.
    //   4. Auto-reconnect with exponential backoff (3 s → 30 s).
    //   5. Token is renewed based on the JWT exp field, ≥60 s before expiry.
    //   6. getConsole() is a pure in-memory read — no network on every call.
    //
    // Native path:
    //   Capacitor / static-rocket environments fall back to the Netlify bridge
    //   (server-to-server WS inside a Netlify Function, throttled to 1 call/5 s).
    // ─────────────────────────────────────────────────────────────────────────

    // ── Console socket state ────────────────────────────────────────────────
    private wsMap      = new Map<string, WebSocket>();
    private wsBackoff  = new Map<string, number>();           // current delay ms
    private wsReconTimer = new Map<string, ReturnType<typeof setTimeout>>();
    private wsRenewTimer = new Map<string, ReturnType<typeof setTimeout>>();
    private wsDestroyed  = new Set<string>();                 // sockets closed on purpose

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Parse the exp from a JWT and return the expiry timestamp in ms. */
    private jwtExp(token: string): number {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (typeof payload.exp === 'number') return payload.exp * 1000;
        } catch { }
        return Date.now() + 14 * 60 * 1000; // fallback: 14 min
    }

    /**
     * Rewrite the Wings WebSocket URL so it goes through the Nginx reverse
     * proxy on the same host/port as the panel (port 25443, already open).
     * Wings runs on :8080 internally and Nginx forwards /api/servers/ there.
     */
    private rewriteWsUrl(socketUrl: string): string {
        try {
            const panelUrl = new URL(this.baseUrl);
            const wsUrl    = new URL(socketUrl);
            wsUrl.hostname = panelUrl.hostname;
            wsUrl.port     = panelUrl.port || '443';
            wsUrl.protocol = 'wss:';
            return wsUrl.toString();
        } catch {
            return socketUrl;
        }
    }

    private appendLog(serverId: string, line: string) {
        const existing = this.consoleLogsMap.get(serverId) || [];
        const filtered = existing.filter(l => !l.startsWith('[Pterodactyl Console:'));
        this.consoleLogsMap.set(serverId, [...filtered, line].slice(-300));
    }

    // ── Public API ──────────────────────────────────────────────────────────

    async getConsole(serverId: string, amountOfLines = 50): Promise<string[]> {
        if (!this.consoleLogsMap.has(serverId)) {
            this.consoleLogsMap.set(serverId, [`[Pterodactyl Console: connecting to ${serverId}...]`]);
        }

        const isNative =
            (window as any).Capacitor?.isNative ||
            (window as any).Capacitor?.isNativePlatform?.() ||
            window.location.protocol === 'capacitor:' ||
            window.location.protocol === 'static-rocket:';

        if (isNative) {
            await this._nativePoll(serverId);
        } else {
            // Fire-and-forget: ensures the socket is open; returns immediately.
            this._ensureSocket(serverId);
        }

        return (this.consoleLogsMap.get(serverId) || []).slice(-amountOfLines);
    }

    // ── Persistent browser WebSocket ────────────────────────────────────────

    private async _ensureSocket(serverId: string): Promise<void> {
        if (this.wsDestroyed.has(serverId)) return;

        const existing = this.wsMap.get(serverId);
        if (existing &&
            (existing.readyState === WebSocket.OPEN ||
             existing.readyState === WebSocket.CONNECTING)) {
            return;
        }

        let token: string;
        let rawSocket: string;
        try {
            const data = await this.fetchApi(`/api/client/servers/${serverId}/websocket`);
            const attr = data?.attributes || data?.data?.attributes || data?.data || {};
            token     = attr.token  || '';
            rawSocket = attr.socket || '';
        } catch (err: any) {
            console.warn('[PTERODACTYL WS] Token fetch failed:', err.message);
            this._scheduleReconnect(serverId);
            return;
        }

        if (!token || !rawSocket) {
            console.warn('[PTERODACTYL WS] Empty token or socket URL');
            this._scheduleReconnect(serverId);
            return;
        }

        const socketUrl = this.rewriteWsUrl(rawSocket);
        console.info(`[PTERODACTYL WS] Connecting → ${socketUrl}`);

        let ws: WebSocket;
        try {
            ws = new WebSocket(socketUrl);
        } catch (err: any) {
            console.warn('[PTERODACTYL WS] WebSocket constructor failed:', err.message);
            this._scheduleReconnect(serverId);
            return;
        }

        this.wsMap.set(serverId, ws);
        let authed = false;

        // Schedule token renewal 60 s before it expires
        const expiresAt = this.jwtExp(token);
        const renewIn   = Math.max(10_000, expiresAt - Date.now() - 60_000);
        const renewTimer = setTimeout(() => {
            console.info('[PTERODACTYL WS] Renewing token for', serverId);
            ws.close(1000, 'token_renewal');
        }, renewIn);
        this.wsRenewTimer.set(serverId, renewTimer);

        ws.onopen = () => {
            ws.send(JSON.stringify({ event: 'auth', args: [token] }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data as string);
                switch (msg.event) {
                    case 'auth success':
                        authed = true;
                        this.wsBackoff.set(serverId, 0); // reset backoff on success
                        ws.send(JSON.stringify({ event: 'send logs', args: [] }));
                        // Update placeholder now that we're live
                        if ((this.consoleLogsMap.get(serverId) || []).some(l => l.startsWith('[Pterodactyl Console:'))) {
                            this.consoleLogsMap.set(serverId, [`[Pterodactyl Console: linked — waiting for output...]`]);
                        }
                        break;

                    case 'console output': {
                        const raw   = msg.args?.[0] || '';
                        const clean = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd();
                        if (clean) this.appendLog(serverId, clean);
                        break;
                    }

                    case 'token expiring':
                    case 'token expired':
                        // Panel asked us to refresh — close cleanly; onclose will reconnect
                        clearTimeout(this.wsRenewTimer.get(serverId));
                        ws.close(1000, 'token_expiring');
                        break;

                    default:
                        break;
                }
            } catch { }
        };

        ws.onerror = () => {
            console.warn('[PTERODACTYL WS] Socket error for', serverId);
        };

        ws.onclose = (ev) => {
            clearTimeout(this.wsRenewTimer.get(serverId));
            this.wsMap.delete(serverId);

            if (this.wsDestroyed.has(serverId)) return; // intentional close
            if (!authed) {
                // Connection closed before auth — might be a proxy issue; show msg
                const logs = this.consoleLogsMap.get(serverId) || [];
                if (logs.some(l => l.startsWith('[Pterodactyl Console:'))) {
                    this.consoleLogsMap.set(serverId, [`[Pterodactyl Console: connection failed (code ${ev.code}) — retrying...]`]);
                }
            }
            this._scheduleReconnect(serverId);
        };
    }

    private _scheduleReconnect(serverId: string) {
        if (this.wsDestroyed.has(serverId)) return;
        clearTimeout(this.wsReconTimer.get(serverId));

        const current = this.wsBackoff.get(serverId) ?? 0;
        const delay   = current === 0 ? 3_000 : Math.min(current * 2, 30_000);
        this.wsBackoff.set(serverId, delay);

        console.info(`[PTERODACTYL WS] Reconnecting in ${delay / 1000}s for ${serverId}`);
        const t = setTimeout(() => this._ensureSocket(serverId), delay);
        this.wsReconTimer.set(serverId, t);
    }

    // ── Native fallback (Netlify bridge) ────────────────────────────────────
    private _lastNativePoll  = new Map<string, number>();
    private _nativeCredsCache = new Map<string, { token: string; socket: string }>();

    private async _nativePoll(serverId: string): Promise<void> {
        const last = this._lastNativePoll.get(serverId) || 0;
        if (Date.now() - last < 5000) return;
        this._lastNativePoll.set(serverId, Date.now());

        const cleanKey = this.apiKey.replace(/^Bearer\s+/i, '');
        try {
            const cached  = this._nativeCredsCache.get(serverId);
            const headers: Record<string, string> = {
                'pterodactyl-base-url': this.baseUrl,
                'pterodactyl-api-key':  cleanKey,
                'pterodactyl-server-id': serverId,
            };
            if (cached) {
                headers['pterodactyl-ws-token']  = cached.token;
                headers['pterodactyl-ws-socket'] = cached.socket;
            }

            const res = await fetch('/.netlify/functions/pterodactyl-console', { method: 'GET', headers });
            if (!res.ok) return;

            const data = await res.json();
            if (data?.needsRefresh) {
                this._nativeCredsCache.delete(serverId);
            } else if (data?.wsToken && data?.wsSocket) {
                this._nativeCredsCache.set(serverId, { token: data.wsToken, socket: data.wsSocket });
            }

            const newLogs: string[] = data?.logs || [];
            if (newLogs.length > 0) {
                const existing = this.consoleLogsMap.get(serverId) || [];
                const merged   = [
                    ...existing.filter(l => !l.startsWith('[Pterodactyl Console:') && l.startsWith('> [EXEC]:')),
                    ...newLogs
                ].slice(-200);
                this.consoleLogsMap.set(serverId, merged);
            }
        } catch (e: any) {
            if (!SILENT_ERRORS) console.warn('[PTERODACTYL] Native poll failed:', e.message);
        }
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────

    closeAllWebSockets(): void {
        for (const [id, ws] of this.wsMap) {
            this.wsDestroyed.add(id);
            try { ws.close(1000, 'logout'); } catch { }
        }
        for (const t of this.wsReconTimer.values()) clearTimeout(t);
        for (const t of this.wsRenewTimer.values()) clearTimeout(t);
        this.wsMap.clear();
        this.wsReconTimer.clear();
        this.wsRenewTimer.clear();
        this.wsBackoff.clear();
        this.wsDestroyed.clear();
        this.consoleLogsMap.clear();
        this._nativeCredsCache.clear();
    }
}