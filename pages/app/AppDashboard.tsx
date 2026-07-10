import React, { useState, useEffect, useCallback } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { isNativeApp } from '../../utils/deviceDetection';

const AppDashboard: React.FC = () => {
    const { config, loading: configLoading, isDashboardGloballyEnabled } = useConfig();
    const { user, mcssService, loading: authLoading, logout } = useAuth();

    const [scrolled, setScrolled] = useState(false);
    const [serverId, setServerId] = useState<string | null>(null);
    const [serverName, setServerName] = useState<string>('MANFREDONIA');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [gracePassed, setGracePassed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<{ time: string; tag: string; msg: string; color?: string }[]>([]);

    // Immediate Boot Log
    useEffect(() => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs([{ time: `[${time}]`, tag: 'SYS:', msg: 'BOOTING_SEQUENCER...', color: 'text-white/40' }]);
    }, []);
    const [serverStatus, setServerStatus] = useState<{
        online: boolean;
        players?: { online: number; max: number };
        cpu?: number;
        ram?: number;
        latency?: number;
        statusText?: string;
        isUnreachable?: boolean;
    }>({ online: false, statusText: 'SYNCING', isUnreachable: true });

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const addLog = useCallback((tag: string, msg: string, color?: string) => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => {
            const next = [...prev, { time: `[${time}]`, tag, msg, color }];
            return next.slice(-8);
        });
    }, []);

    const fetchDetailedStats = useCallback(async () => {
        if (!mcssService) {
            addLog('ERR:', 'Tactical Bridge Missing', 'text-red-400');
            return;
        }
        try {
            let currentServerId = serverId;
            if (!currentServerId) {
                addLog('INF:', 'Resolving Node Identity...', 'text-white/30');
                const servers = await mcssService.getServers();
                if (servers.length > 0) {
                    currentServerId = servers[0].serverId;
                    setServerId(currentServerId);
                    setServerName(servers[0].name.toUpperCase());
                    addLog('OK:', `Node Identity Secured: ${servers[0].name.toUpperCase()}`, 'text-blue-400');
                } else {
                    setServerStatus(prev => ({ ...prev, statusText: 'NO NODES', isUnreachable: false }));
                    addLog('WRN:', 'No active nodes found on uplink', 'text-amber-400');
                    return;
                }
            }

            if (currentServerId) {
                addLog('INF:', 'Synchronizing Telemetry...', 'text-white/30');
                const startTime = Date.now();
                const [stats, servers] = await Promise.all([
                    mcssService.getServerStats(currentServerId),
                    mcssService.getServers()
                ]);
                const latency = Date.now() - startTime;
                const server = servers.find(s => s.serverId === currentServerId);
                if (server) setServerName(server.name.toUpperCase());

                const statusMap: { [key: number]: string } = {
                    0: 'OFFLINE', 1: 'ONLINE', 2: 'RESTARTING', 3: 'STARTING', 4: 'STOPPING'
                };

                setServerStatus({
                    online: server?.status === 1,
                    statusText: statusMap[server?.status ?? 0] || 'UNKNOWN',
                    cpu: stats.cpuUsage,
                    ram: stats.ramUsage,
                    players: { online: stats.onlinePlayers, max: stats.maxPlayers },
                    latency: latency,
                    isUnreachable: false
                });
                addLog('UP:', 'Uplink Synchronized', 'text-emerald-500/60');
            }
        } catch (err: any) {
            setServerStatus(prev => ({
                ...prev,
                isUnreachable: true,
                statusText: 'UNREACHABLE'
            }));
            addLog('ERR:', `Uplink Fail: ${err.message}`, 'text-red-500');
        }
    }, [mcssService, serverId, addLog]);

    const isInitialSyncStarted = React.useRef(false);
    const lastMcssServiceId = React.useRef<string | null>(null);

    // DEEP DIAGNOSTIC INIT: Bypasses guards to show what's happening
    useEffect(() => {
        const init = async () => {
            // Log raw state info
            const stateInfo = `Auth:${authLoading ? 'WAIT' : 'OK'} Config:${configLoading ? 'WAIT' : 'OK'} Svc:${mcssService ? 'READY' : 'NULL'}`;
            addLog('DBG:', stateInfo, 'text-white/20');

            if (isInitialSyncStarted.current && lastMcssServiceId.current === mcssService?.constructor.name) return;

            try {
                if (mcssService) {
                    isInitialSyncStarted.current = true;
                    lastMcssServiceId.current = mcssService.constructor.name;

                    addLog('UP:', `Uplink Engine: ONLINE`, 'text-blue-500');
                    await fetchDetailedStats();
                } else if (!authLoading && !configLoading) {
                    addLog('WRN:', 'Missing Tactical Bridge', 'text-amber-500/40');
                    setServerStatus(prev => ({ ...prev, isUnreachable: true, statusText: 'BRIDGE_MISSING' }));
                }
            } catch (err: any) {
                console.error('[Dashboard] Init failed:', err);
                addLog('ERR:', `Init Critical: ${err.message}`, 'text-red-600 font-bold');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [configLoading, authLoading, mcssService, fetchDetailedStats, addLog]);

    useEffect(() => {
        const timer = setTimeout(() => setGracePassed(true), 4000);
        return () => clearTimeout(timer);
    }, []);

    // Literal Polling Logic from web - Fast recovery (15s)
    useEffect(() => {
        if (!user || loading || !mcssService) return;

        const intervalTime = serverStatus.isUnreachable ? 15000 : 5000;
        const interval = setInterval(() => {
            fetchDetailedStats();
        }, intervalTime);

        return () => clearInterval(interval);
    }, [mcssService, user, loading, fetchDetailedStats, serverStatus.isUnreachable]);

    const handleServerAction = async (action: string) => {
        if (!mcssService || !serverId || actionLoading) return;
        setActionLoading(action);
        addLog('CMD:', `Exec ${action.toUpperCase()}`, 'text-orange-400');
        try {
            await Haptics.impact({ style: ImpactStyle.Heavy });
            await mcssService.executeAction(serverId, action);
            addLog('OK:', `${action.toUpperCase()} acknowledge`, 'text-emerald-400');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await fetchDetailedStats();
            await Haptics.notification({ type: 'SUCCESS' as any });
        } catch (err: any) {
            addLog('ERR:', `Failed: ${err.message}`, 'text-red-400');
            await Haptics.notification({ type: 'ERROR' as any });
            if (err.message?.includes('fetch') || err.message?.includes('Network')) {
                setServerStatus(prev => ({ ...prev, isUnreachable: true }));
            }
        } finally {
            setActionLoading(null);
        }
    };


    if (!user || (!user.isApproved && !user.isAdmin)) {
        return (
            <div className="bg-[#050505] min-h-screen text-white font-sans flex flex-col items-center justify-center p-6 text-center gap-8">
                <div className="size-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 shadow-2xl relative">
                    <span className="material-symbols-outlined text-5xl">verified_user</span>
                    <div className="absolute -top-1 -right-1 size-4 bg-amber-500 rounded-full border-4 border-[#050505]" />
                </div>
                <div className="flex flex-col gap-3">
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-white italic">Approval Pending</h2>
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.4em] leading-relaxed max-w-xs mx-auto">
                        Administrator verification required for uplink.
                    </p>
                </div>
                <button
                    onClick={() => logout()}
                    className="px-10 py-4 bg-white text-black font-black uppercase text-[10px] tracking-[0.4em] rounded-xl active:scale-95 transition-all"
                >
                    Logout Session
                </button>
            </div>
        );
    }

    if (!isDashboardGloballyEnabled && !user.isAdmin) {
        return (
            <div className="bg-[#050505] min-h-screen text-white font-sans flex flex-col items-center justify-center p-6 text-center gap-8">
                <div className="size-24 rounded-2xl bg-white/5 border border-red-500/20 flex items-center justify-center text-red-500/40 shadow-2xl relative">
                    <span className="material-symbols-outlined text-5xl">sensors_off</span>
                </div>
                <div className="flex flex-col gap-3">
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-red-500 italic">Uplink Restricted</h2>
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.4em] leading-relaxed max-w-xs mx-auto">
                        Maintenance Active. Terminal Access Suspended.
                    </p>
                </div>
                <button
                    onClick={() => logout()}
                    className="px-10 py-4 bg-white/5 border border-white/10 text-white/40 font-black uppercase text-[10px] tracking-[0.4em] rounded-xl active:scale-95 transition-all"
                >
                    Logout
                </button>
            </div>
        );
    }

    return (
        <div className="bg-[#050505] min-h-screen text-white font-sans overflow-x-hidden pb-40">
            {/* Background mirror */}
            <div className="fixed inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.05)_0%,transparent_70%)] pointer-events-none" />

            <header className={`fixed top-0 left-0 w-full z-[80] transition-all duration-300 ${scrolled ? 'bg-black/80 backdrop-blur-2xl border-b border-white/5' : 'bg-transparent'}`}>
                <div className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+0.5rem)] pb-5 max-w-2xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl shrink-0">
                            <span className="material-symbols-outlined text-lg text-blue-400">terminal</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <h1 className="font-black text-white uppercase tracking-tighter text-lg italic leading-none truncate">{config?.siteInfo?.title || serverName}</h1>
                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest mt-1">Uplink_Node_Active</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        <div className={`size-1.5 rounded-full animate-pulse ${serverStatus.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{serverStatus.statusText}</span>
                    </div>
                </div>
            </header>

            <main className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+7rem)] flex flex-col gap-6 max-w-2xl mx-auto relative">
                {/* Status & Controls Group with Tactical Overlay */}
                <div className="relative">
                    <AnimatePresence>
                        {(serverStatus.isUnreachable || !gracePassed) && (
                            <motion.div
                                key="uplink-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-x-0 -top-4 -bottom-4 z-50 flex flex-col items-center justify-center bg-[#050505]/75 backdrop-blur-[6px] p-8 text-center rounded-3xl border border-white/5"
                            >
                                <div className="flex flex-col items-center gap-6">
                                    {!gracePassed ? (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="size-12 border-b-2 border-emerald-500 rounded-full animate-spin" />
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] font-mono font-black text-emerald-400 uppercase tracking-[0.4em]">Establishing_Uplink</span>
                                                <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">Awaiting_Secure_Handshake...</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-6">
                                            <div className="flex flex-col items-center gap-4">
                                                <span className="material-symbols-outlined text-4xl text-red-500/40">link_off</span>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-mono font-black text-white/40 uppercase tracking-[0.4em]">Signal_Lost</span>
                                                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest mt-1">Review Audit logs below for details.</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => { fetchDetailedStats(); setGracePassed(false); }}
                                                className="px-6 py-2 rounded-lg bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-[0.3em] hover:bg-white/10 active:scale-95 transition-all text-white/60"
                                            >
                                                Force_Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex flex-col gap-6">
                        {/* Status Bento Card */}
                        <div className="p-6 rounded-2xl border border-white/10 bg-[#0A0A0A]/60 backdrop-blur-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <span className="material-symbols-outlined text-4xl">sensors</span>
                            </div>
                            <div className="flex flex-col gap-6">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">Link_Latency</span>
                                        <span className="text-3xl font-black italic tracking-tighter text-white">
                                            {serverStatus.latency ? `${serverStatus.latency}ms` : '---'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-1">Active_Nodes</span>
                                        <span className="text-3xl font-black italic tracking-tighter text-blue-400">
                                            {serverStatus.players?.online || 0}<span className="text-white/20 text-xl">/</span>{serverStatus.players?.max || 0}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                            <span className="text-white/20">CPU_Load</span>
                                            <span className="text-white/60">{serverStatus.cpu || 0}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                            <motion.div animate={{ width: `${serverStatus.cpu || 0}%` }} className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                            <span className="text-white/20">RAM_Alloc</span>
                                            <span className="text-white/60">{serverStatus.ram || 0}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                            <motion.div animate={{ width: `${serverStatus.ram || 0}%` }} className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tactical Controls */}
                        <section className="space-y-4">
                            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 px-4">Tactical_Ops</span>
                            <div className="grid grid-cols-1 gap-3">
                                {[
                                    { id: 'Start', label: 'Start_Sequence', icon: 'play_arrow', color: 'text-emerald-400', disabled: serverStatus.statusText !== 'OFFLINE' },
                                    { id: 'Stop', label: 'Terminate_Node', icon: 'square', color: 'text-red-400', disabled: serverStatus.statusText !== 'ONLINE' },
                                    { id: 'Restart', label: 'Reboot_Core', icon: 'restart_alt', color: 'text-orange-400', disabled: serverStatus.statusText !== 'ONLINE' }
                                ].map(btn => (
                                    <button
                                        key={btn.id}
                                        onClick={() => handleServerAction(btn.id)}
                                        disabled={btn.disabled || !!actionLoading || serverStatus.isUnreachable}
                                        className={`flex items-center justify-between p-5 rounded-2xl bg-[#0A0A0A]/40 border border-white/5 active:scale-[0.98] transition-all relative overflow-hidden group ${btn.disabled || !!actionLoading || serverStatus.isUnreachable ? 'opacity-20 grayscale' : 'hover:bg-white/[0.03]'}`}
                                    >
                                        <div className="flex items-center gap-4 relative z-10">
                                            <span className={`material-symbols-outlined ${btn.color}`}>{btn.icon}</span>
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80">{btn.label}</span>
                                        </div>
                                        {actionLoading === btn.id ? (
                                            <div className="size-4 border-2 border-white/10 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">EXEC_PRIV_L2</span>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.03] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Audit Feed */}
                <section className="space-y-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 px-4">Security_Audit</span>
                    <div className="p-6 rounded-2xl border border-white/5 bg-black/40 font-mono text-[9px] text-white/40 leading-relaxed uppercase tracking-widest space-y-2 relative overflow-hidden min-h-[100px]">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none" />
                        {logs.length === 0 ? (
                            <div className="flex gap-3 animate-pulse">
                                <span className="text-white/10">[..]</span>
                                <span>Awaiting_Signal...</span>
                            </div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="flex gap-3 animate-in slide-in-from-left duration-300">
                                    <span className="text-white/10">{log.time}</span>
                                    <span className={`${log.color || 'text-white/40'} font-bold`}>{log.tag}</span>
                                    <span className="text-white/60 lowercase">{log.msg}</span>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default AppDashboard;
