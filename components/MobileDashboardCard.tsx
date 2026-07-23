import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

export const MobileDashboardCard: React.FC = () => {
    const { mcssService, user } = useAuth();
    const [activeTab, setActiveTab] = useState<'overview' | 'console'>('overview');

    // Discovery & State
    const [serverId, setServerId] = useState<string | null>(null);
    const consecutiveFails = useRef(0);
    const [stats, setStats] = useState<{
        online: boolean;
        status: number; // 0: Offline, 1: Online, 2: Restarting, 3: Starting, 4: Stopping
        players: { online: number; max: number };
        cpu: number;
        ram: number;
        latency?: number;
        statusText: string;
        unreachable?: boolean;
    }>({
        online: false,
        status: 0,
        players: { online: 0, max: 0 },
        cpu: 0,
        ram: 0,
        latency: 0,
        statusText: 'SYNCING',
        unreachable: true
    });

    // Notification State
    const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([]);

    const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setNotifications(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 4000);
    };

    // Console State
    const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
    const [commandInput, setCommandInput] = useState('');
    const consoleContainerRef = useRef<HTMLDivElement>(null);

    // Action State
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [gracePassed, setGracePassed] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const [pendingTransition, setPendingTransition] = useState<{ statusText: string; targetOnline: boolean; startedAt: number } | null>(null);

    const fetchStats = useCallback(async () => {
        if (!mcssService) return;
        try {
            let currentServerId = serverId;
            if (!currentServerId) {
                const servers = await mcssService.getServers();
                if (servers.length > 0) {
                    currentServerId = servers[0].serverId;
                    setServerId(currentServerId);
                }
            }

            if (currentServerId) {
                const startTime = Date.now();
                const [serverStats, servers] = await Promise.all([
                    mcssService.getServerStats(currentServerId),
                    mcssService.getServers()
                ]);
                const latency = Date.now() - startTime;

                if (!serverStats || !servers) throw new Error('Incomplete data from MCSS');

                const server = servers.find(s => s.serverId === currentServerId);
                const currentStatus = serverStats?.status ?? server?.status ?? 0;

                const statusMap: { [key: number]: string } = {
                    0: 'OFFLINE', 1: 'ONLINE', 2: 'RESTARTING', 3: 'STARTING', 4: 'STOPPING'
                };

                let finalStatusText = statusMap[currentStatus] || 'UNKNOWN';
                let isOnline = currentStatus === 1;

                if (pendingTransition) {
                    const elapsed = Date.now() - pendingTransition.startedAt;
                    if (elapsed > 30000) {
                        setPendingTransition(null);
                    } else if (pendingTransition.targetOnline) {
                        if (currentStatus === 1) {
                            setPendingTransition(null);
                            finalStatusText = 'ONLINE';
                            isOnline = true;
                        } else {
                            finalStatusText = 'STARTING';
                            isOnline = false;
                        }
                    } else {
                        if (currentStatus === 0) {
                            setPendingTransition(null);
                            finalStatusText = 'OFFLINE';
                            isOnline = false;
                        } else {
                            finalStatusText = 'STOPPING';
                            isOnline = false;
                        }
                    }
                }

                consecutiveFails.current = 0; // Success: reset threshold
                setStats({
                    online: isOnline,
                    status: currentStatus,
                    statusText: finalStatusText,
                    cpu: serverStats?.cpuUsage ?? 0,
                    ram: serverStats?.ramUsage ?? 0,
                    players: { online: serverStats?.onlinePlayers ?? 0, max: serverStats?.maxPlayers ?? 20 },
                    latency: latency,
                    unreachable: false
                });
            }
        } catch (err: any) {
            if (pendingTransition) {
                const elapsed = Date.now() - pendingTransition.startedAt;
                if (elapsed > 30000) {
                    setPendingTransition(null);
                    setStats(prev => ({ ...prev, statusText: 'LOSS_SYNC', unreachable: true }));
                } else {
                    setStats(prev => ({ ...prev, statusText: pendingTransition.statusText, unreachable: false }));
                }
            } else {
                setStats(prev => ({ ...prev, statusText: 'LOSS_SYNC', unreachable: true }));
            }
        }
    }, [mcssService, serverId, pendingTransition]);

    useEffect(() => {
        fetchStats();
        const intervalTime = pendingTransition ? 2000 : (stats.unreachable ? 300000 : 5000);
        const interval = setInterval(fetchStats, intervalTime);

        return () => {
            clearInterval(interval);
        };
    }, [fetchStats, stats.unreachable, pendingTransition]);

    // gracePassed is now triggered by the loading bar's onAnimationComplete
    // to ensure perfect synchronization with the visual progress.

    // Console Polling
    useEffect(() => {
        if (!mcssService || !serverId || activeTab !== 'console') return;

        const fetchConsole = async () => {
            if (stats.unreachable) return; // Skip polling if server is known to be unreachable
            try {
                const logs = await mcssService.getConsole(serverId, 50);
                setConsoleLogs(logs);
            } catch (err) {
                // If console fails, we don't necessarily want to spam notifications
                // addNotification('error', 'Failed to fetch console logs.');
            }
        };

        if (!stats.unreachable) fetchConsole();
        const interval = setInterval(fetchConsole, 3000);
        return () => clearInterval(interval);
    }, [mcssService, serverId, activeTab, stats.unreachable]);

    // Track if we should auto-scroll
    const shouldAutoScrollRef = useRef(true);
    const isInteractingRef = useRef(false);

    // SCROLL TRAP
    useEffect(() => {
        if (activeTab !== 'console') return;
        const element = consoleContainerRef.current;
        if (!element) return;

        let startY = 0;

        const onTouchStart = (e: TouchEvent) => {
            startY = e.touches[0].clientY;
            isInteractingRef.current = true;
            const { scrollTop, scrollHeight, clientHeight } = element;
            shouldAutoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 10;
        };

        const onTouchEnd = () => {
            isInteractingRef.current = false;
        };

        const onTouchMove = (e: TouchEvent) => {
            const currentY = e.touches[0].clientY;
            const distance = startY - currentY;
            const isScrollingDown = distance > 0;
            const isScrollingUp = distance < 0;
            const { scrollTop, scrollHeight, clientHeight } = element;
            const isAtTop = scrollTop <= 0;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

            if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
                if (e.cancelable) e.preventDefault();
            }
            e.stopPropagation();
        };

        const onWheel = (e: WheelEvent) => {
            const { scrollTop, scrollHeight, clientHeight } = element;
            const isAtTop = scrollTop <= 0;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
            if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
                if (e.cancelable) e.preventDefault();
            }
            e.stopPropagation();
        };

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchend', onTouchEnd, { passive: true });
        element.addEventListener('touchcancel', onTouchEnd, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: false });
        element.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            element.removeEventListener('touchstart', onTouchStart);
            element.removeEventListener('touchend', onTouchEnd);
            element.removeEventListener('touchcancel', onTouchEnd);
            element.removeEventListener('touchmove', onTouchMove);
            element.removeEventListener('wheel', onWheel);
        };
    }, [activeTab]);

    const hasScrolledRef = useRef(false);

    useEffect(() => {
        if (activeTab === 'console' && consoleLogs.length > 0 && !hasScrolledRef.current && consoleContainerRef.current) {
            consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
            hasScrolledRef.current = true;
        }
        if (activeTab !== 'console') {
            hasScrolledRef.current = false;
        }
    }, [activeTab, consoleLogs]);

    const handleAction = async (action: string) => {
        if (!mcssService || !serverId || actionLoading) return;
        setActionLoading(action);

        const isStart = action === 'Start' || action === 'Restart';
        const isStop = action === 'Stop' || action === 'Kill';
        const now = Date.now();

        if (isStart) {
            setPendingTransition({ statusText: 'STARTING', targetOnline: true, startedAt: now });
            setStats(prev => ({ ...prev, statusText: 'STARTING', online: false, status: 3, unreachable: false }));
        } else if (isStop) {
            setPendingTransition({ statusText: 'STOPPING', targetOnline: false, startedAt: now });
            setStats(prev => ({ ...prev, statusText: 'STOPPING', online: false, status: 4, unreachable: false }));
        }

        try {
            await mcssService.executeAction(serverId, action);
            fetchStats();
        } catch (err) {
            setPendingTransition(null);
            addNotification('error', `Failed to execute ${action}`);
        } finally {
            setActionLoading(null);
        }
    };

    const sendCommand = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!commandInput.trim() || !mcssService || !serverId) return;
        const cmd = commandInput;
        setCommandInput('');
        try {
            await mcssService.executeCommand(serverId, cmd);
            addNotification('info', `Executed: ${cmd}`);
        } catch (err) {
            addNotification('error', `Failed to send command: ${cmd}`);
        }
    };

    if (!user) return null;

    if (!user.isApproved && !user.isAdmin) {
        return (
            <div className="glass-card bg-[#080808]/80 rounded-2xl border border-amber-500/10 shadow-2xl p-8 flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <span className="material-symbols-outlined text-8xl">verified_user</span>
                </div>
                <div className="size-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-2">
                    <span className="material-symbols-outlined text-3xl">lock_clock</span>
                </div>
                <div className="flex flex-col gap-2">
                    <h3 className="text-xl font-black uppercase tracking-tighter text-white italic">Access Restricted</h3>
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] leading-relaxed max-w-[200px]">Verification from central command is required for dashboard synchronization.</p>
                </div>
                <div className="w-full h-px bg-white/5" />
                <span className="text-[9px] font-bold text-amber-500/50 uppercase tracking-[0.3em] animate-pulse">Waiting for approval...</span>
            </div>
        );
    }

    return (
        <div className="glass-card bg-[#080808]/80 rounded-2xl border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden relative">

            {/* Notification Overlay */}
            <div className="absolute bottom-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
                <AnimatePresence>
                    {(notifications || []).map((notif) => (
                        <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, y: -20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                            className={`pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-xl border backdrop-blur-md shadow-2xl ${notif.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                notif.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                    'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                }`}
                        >
                            <div className={`size-2 rounded-full ${notif.type === 'success' ? 'bg-emerald-500 animate-pulse' :
                                notif.type === 'error' ? 'bg-red-500' :
                                    'bg-blue-500'
                                }`}></div>
                            <span className="text-[10px] font-black uppercase tracking-widest">{notif.message}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header / Status Bar */}
            <div className="relative px-5 py-4 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className={`size-2 rounded-full shadow-[0_0_8px_currentColor] transition-colors duration-500 ${stats.unreachable && !stats.online ? 'bg-red-500 text-red-500 animate-pulse' : stats.online ? 'bg-emerald-500 text-emerald-500' : 'bg-rose-500 text-rose-500'}`}></span>
                        <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                            {stats.unreachable && stats.online ? 'Limited Uplink' : stats.online ? 'System Online' : 'System Offline'}
                        </span>
                    </div>
                    <div className="flex items-center gap-4 pl-4">
                        <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                            ID: {stats.unreachable && !stats.online ? 'SIGNAL LOST' : (serverId || 'SCANNING...')}
                        </span>
                    </div>
                </div>
                <div className="px-2 py-1 bg-white/5 rounded text-[9px] font-mono text-white/40">V2.0</div>
            </div>

            <div className="p-5 flex flex-col gap-6 relative">
                <div className="flex p-1 bg-black/40 rounded-xl border border-white/5 relative items-center">
                    {/* Active Tab Indicator */}
                    <motion.div
                        initial={false}
                        animate={{
                            x: activeTab === 'overview' ? '0%' : '100%'
                        }}
                        transition={mounted ? { type: "spring", bounce: 0.2, duration: 0.6 } : { duration: 0 }}
                        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white/10 rounded-lg border border-white/5 shadow-inner"
                    />

                    {['overview', 'console'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className="relative flex-1 py-2.5 z-10 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-300 text-center outline-none focus:outline-none"
                            style={{ color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.3)' }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' ? (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                className="flex flex-col gap-8 h-[420px] justify-between relative"
                            >
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-[120px] relative overflow-hidden group/chart">
                                        <div className="flex justify-between items-start z-10">
                                            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">CPU</span>
                                            <span className="material-symbols-outlined text-white/20 text-sm">memory</span>
                                        </div>
                                        <div className="flex items-baseline gap-1 z-10">
                                            <span className="text-2xl font-mono font-bold text-white tracking-tighter">{stats.cpu}</span>
                                            <span className="text-[10px] text-white/30">%</span>
                                        </div>
                                        <div className="absolute inset-0 opacity-20 pointer-events-none flex items-end justify-end p-2 gap-0.5">
                                            {[40, 60, 30, 80, 50, stats.cpu].map((h, i) => (
                                                <div key={i} className="w-1.5 bg-blue-500 rounded-t-sm transition-all duration-500" style={{ height: `${Math.min(h, 100)}%` }}></div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl flex flex-col justify-between h-[120px] relative overflow-hidden">
                                        <div className="flex justify-between items-start z-10">
                                            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">RAM</span>
                                            <span className="material-symbols-outlined text-white/20 text-sm">storage</span>
                                        </div>
                                        <div className="flex items-baseline gap-1 z-10">
                                            <span className="text-2xl font-mono font-bold text-white tracking-tighter">{stats.ram}</span>
                                            <span className="text-[10px] text-white/30">%</span>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                                            <div className="h-full bg-purple-500/50" style={{ width: `${stats.ram}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="col-span-2 bg-gradient-to-r from-white/[0.04] to-transparent border border-white/5 p-5 rounded-2xl flex items-center justify-between relative overflow-hidden">
                                        <div className="flex flex-col gap-1 z-10">
                                            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest">Active Players</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-mono font-bold text-white tracking-tighter">{stats.players.online}</span>
                                                <span className="text-xs text-white/30 font-medium">/ {stats.players.max} CAP</span>
                                            </div>
                                        </div>
                                        <div className="flex -space-x-2 z-10">
                                            {Array.from({ length: Math.min(stats.players.online, 3) }).map((_, i) => (
                                                <div key={i} className="size-8 rounded-full bg-white/10 border border-black/50 flex items-center justify-center text-[10px] text-white/50">
                                                    <span className="material-symbols-outlined text-sm">person</span>
                                                </div>
                                            ))}
                                            {stats.players.online > 3 && (
                                                <div className="size-8 rounded-full bg-white/5 border border-black/50 flex items-center justify-center text-[9px] text-white/50 font-bold">
                                                    +{stats.players.online - 3}
                                                </div>
                                            )}
                                        </div>
                                        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black/50 to-transparent"></div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center gap-2 opacity-50">
                                        <div className="h-px flex-1 bg-white/10"></div>
                                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">Manual Override</span>
                                        <div className="h-px flex-1 bg-white/10"></div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <button onClick={() => handleAction('Start')} disabled={stats.status !== 0 || !!actionLoading || stats.unreachable} className="relative group overflow-hidden p-0.5 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none">
                                            <div className="absolute inset-0 bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors rounded-xl"></div>
                                            <div className="relative bg-[#0a0a0a] rounded-[10px] h-full p-5 flex flex-col items-center justify-center gap-2 border border-white/5">
                                                <span className="material-symbols-outlined text-emerald-500 text-xl group-hover:scale-110 transition-transform">play_arrow</span>
                                                <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">Start</span>
                                            </div>
                                        </button>
                                        <button onClick={() => handleAction('Restart')} disabled={stats.status !== 1 || !!actionLoading || stats.unreachable} className="relative group overflow-hidden p-0.5 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none">
                                            <div className="absolute inset-0 bg-amber-500/20 group-hover:bg-amber-500/30 transition-colors rounded-xl"></div>
                                            <div className="relative bg-[#0a0a0a] rounded-[10px] h-full p-5 flex flex-col items-center justify-center gap-2 border border-white/5">
                                                <span className="material-symbols-outlined text-amber-500 text-xl group-hover:rotate-180 transition-transform duration-500">sync</span>
                                                <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">Reboot</span>
                                            </div>
                                        </button>
                                        <button onClick={() => handleAction('Stop')} disabled={stats.status !== 1 || !!actionLoading || stats.unreachable} className="relative group overflow-hidden p-0.5 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none">
                                            <div className="absolute inset-0 bg-rose-500/20 group-hover:bg-rose-500/30 transition-colors rounded-xl"></div>
                                            <div className="relative bg-[#0a0a0a] rounded-[10px] h-full p-5 flex flex-col items-center justify-center gap-2 border border-white/5">
                                                <span className="material-symbols-outlined text-rose-500 text-xl group-hover:scale-110 transition-transform">power_settings_new</span>
                                                <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">Stop</span>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="console"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                                className="flex flex-col gap-0 h-[420px] bg-black/40 rounded-xl border border-white/10 overflow-hidden relative"
                            >
                                <div className="h-6 bg-white/5 border-b border-white/5 flex items-center px-3 gap-2">
                                    <div className="text-[8px] font-mono text-white/30 uppercase">/var/log/server_latest.log</div>
                                </div>
                                <div ref={consoleContainerRef} className="flex-1 p-3 font-mono text-[10px] text-white/80 overflow-y-auto custom-scrollbar overscroll-y-contain touch-pan-y flex flex-col">
                                    {consoleLogs.length === 0 && !stats.unreachable && (
                                        <div className="h-full flex flex-col items-center justify-center text-white/20 gap-2">
                                            <span className="material-symbols-outlined text-2xl animate-spin">data_usage</span>
                                            <span className="text-[9px] uppercase tracking-widest">Establishing Uplink...</span>
                                        </div>
                                    )}
                                    {(consoleLogs || []).map((log, i) => (
                                        <div key={i} className="whitespace-pre-wrap break-all leading-tight mb-1 px-1 rounded">
                                            <span className="text-white/20 mr-2 select-none">|</span>{log}
                                        </div>
                                    ))}
                                </div>

                                <div className={`p-2 bg-white/5 border-t border-white/10 transition-opacity ${stats.unreachable ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
                                    <form onSubmit={sendCommand} className="relative flex items-center gap-2">
                                        <span className="text-emerald-500 font-mono text-xs animate-pulse pl-2">{'>'}</span>
                                        <input
                                            type="text"
                                            value={commandInput}
                                            onChange={(e) => setCommandInput(e.target.value)}
                                            placeholder={stats.unreachable ? "Link lost..." : "Enter validated command..."}
                                            className="flex-1 bg-transparent border-none text-xs font-mono text-white placeholder-white/20 focus:ring-0 focus:outline-none py-2"
                                            autoComplete="off"
                                            disabled={stats.unreachable}
                                        />
                                        <button type="submit" disabled={!commandInput.trim() || stats.unreachable} className="p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors disabled:opacity-0">
                                            <span className="material-symbols-outlined text-sm">keyboard_return</span>
                                        </button>
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Tactical / Error Overlay (Moved to root for full card coverage) */}
            <AnimatePresence>
                {(stats.unreachable || !gracePassed) && (
                    <motion.div
                        key="uplink-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 1, ease: "easeInOut" } }}
                        className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505]/75 backdrop-blur-md p-8 text-center"
                    >
                        {!gracePassed ? (
                            <div className="flex flex-col items-center gap-5 w-48">
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="size-1 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em]">Uplink Sync</span>
                                        <div className="size-1 rounded-full bg-emerald-500 animate-pulse"></div>
                                    </div>
                                    <span className="text-[7px] font-mono text-white/20 uppercase tracking-[0.1em]">Negotiating Handshake...</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden border border-white/5 relative shadow-inner">
                                    <motion.div
                                        initial={{ width: "0%" }}
                                        animate={{ width: "100%" }}
                                        transition={{ duration: 5, ease: [0.65, 0, 0.35, 1] }}
                                        onAnimationComplete={() => setGracePassed(true)}
                                        className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] relative"
                                    >
                                        <div className="absolute top-0 bottom-0 right-0 w-[1px] bg-white/50 shadow-[0_0_5px_#fff]" />
                                    </motion.div>
                                </div>
                                <div className="flex justify-center w-full opacity-20">
                                    <span className="text-[6px] font-mono text-white uppercase tracking-widest animate-pulse">Establishing_Secure_Relay</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-6">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="size-14 rounded-full border border-red-500/20 flex items-center justify-center text-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                                        <span className="material-symbols-outlined text-3xl">link_off</span>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <h3 className="text-sm font-black text-white/60 uppercase tracking-[0.4em] italic mb-1">Signal Lost</h3>
                                        <span className="text-[10px] font-mono text-red-500/30 uppercase tracking-[0.2em]">Retrying_Uplink...</span>
                                    </div>
                                </div>
                                <div className="mt-2 px-8 py-5 bg-white/5 border border-white/10 rounded-2xl max-w-full backdrop-blur-sm">
                                    <p className="text-[11px] font-bold text-white/30 uppercase tracking-[0.05em] leading-relaxed">
                                        Il server potrebbe essere offline.<br />
                                        <span className="text-red-500/60 font-black">DASHBOARD LOCK ACTIVE</span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};
