import React, { useState, useEffect, useCallback } from 'react';
import bgImage from '../../src/assets/bk.jpg';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Countdown from '../../components/Countdown';
import { getLatestRelease } from '../../utils/githubCache';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const AppHome: React.FC = () => {
    const { config, notifications, loading: configLoading } = useConfig();
    const { user, mcssService, markAllBannersAsRead, loading: authLoading } = useAuth();

    // UI States
    const [scrolled, setScrolled] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [serverStatus, setServerStatus] = useState<{
        online: boolean;
        players?: { online: number; max: number };
        statusText?: string;
    }>({ online: false, statusText: 'SYNCING' });
    const [serverId, setServerId] = useState<string | null>(null);
    const [logs, setLogs] = useState<{ time: string; tag: string; msg: string; color?: string }[]>([]);

    const addLog = useCallback((tag: string, msg: string, color?: string) => {
        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLogs(prev => {
            const next = [...prev, { time: `[${time}]`, tag, msg, color }];
            return next.slice(-8);
        });
    }, []);

    // Immediate Boot Log
    useEffect(() => {
        addLog('SYS:', 'BOOTING_SEQUENCER...', 'text-white/40');
    }, [addLog]);

    // Auth Check
    const readIds = user?.read_banner_ids || [];
    const unreadCount = notifications?.filter(b => b.enabled && !readIds.includes(b.id)).length || 0;

    // Native Setup
    useEffect(() => {
        StatusBar.setStyle({ style: Style.Dark });
        SplashScreen.hide();
    }, []);

    const fetchStatus = useCallback(async () => {
        if (!mcssService) return;

        try {
            let currentServerId = serverId;
            if (!currentServerId) {
                addLog('INF:', 'Resolving Node Identity...', 'text-white/30');
                const servers = await mcssService.getServers();
                if (servers.length > 0) {
                    currentServerId = servers[0].serverId;
                    setServerId(currentServerId);
                    addLog('OK:', `Node Identity Secured`, 'text-blue-400');
                }
            }
            if (currentServerId) {
                const servers = await mcssService.getServers();
                const server = servers.find(s => s.serverId === currentServerId);
                setServerStatus({
                    online: server?.status === 1,
                    statusText: server?.status === 1 ? 'ONLINE' : 'OFFLINE',
                });
                addLog('UP:', 'Uplink Synchronized', 'text-emerald-500/60');
            }
        } catch (err: any) {
            addLog('ERR:', `Uplink Fail: ${err.message}`, 'text-red-500');
        }
    }, [mcssService, serverId, addLog]);

    const isInitialSyncStarted = React.useRef(false);

    useEffect(() => {
        const init = async () => {
            const stateInfo = `Auth:${authLoading ? 'WAIT' : 'OK'} Config:${configLoading ? 'WAIT' : 'OK'} Svc:${mcssService ? 'READY' : 'NULL'}`;
            addLog('DBG:', stateInfo, 'text-white/20');

            if (isInitialSyncStarted.current) return;

            if (mcssService) {
                isInitialSyncStarted.current = true;
                addLog('UP:', `Uplink Engine: ONLINE`, 'text-blue-500');
                await fetchStatus();
            }
        };

        if (!configLoading) init();
    }, [configLoading, authLoading, mcssService, fetchStatus, addLog]);

    useEffect(() => {
        if (!config || !mcssService) return;
        const interval = setInterval(fetchStatus, 8000);
        return () => clearInterval(interval);
    }, [config, mcssService, fetchStatus]);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const latest = await getLatestRelease('Ciobert345/Mod-server-Manfredonia');
                if (latest?.tag_name) setLatestVersion(latest.tag_name);
            } catch (error) { }
        };
        if (config) fetchVersion();
    }, [config]);

    const copyIp = async () => {
        const ip = config?.serverMetadata?.ip || 'server-manfredonia.ddns.net';
        await navigator.clipboard.writeText(ip);
        await Haptics.impact({ style: ImpactStyle.Medium });
    };

    const enabledBanners = notifications?.filter(b => b.enabled) || [];

    return (
        <div className="bg-[#050505] min-h-screen text-white font-sans overflow-x-hidden pb-40">
            {/* Background elements - Mirrored from Web */}
            <div className="fixed inset-0 z-[-1]">
                <div className="absolute inset-0 bg-cover bg-center opacity-[0.15] filter grayscale brightness-50" style={{ backgroundImage: `url(${bgImage})` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
            </div>

            {/* Header: Safe Area Aware */}
            <header className={`fixed top-0 left-0 w-full z-[80] transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-2xl border-b border-white/5 shadow-2xl' : 'bg-transparent'}`}>
                <div className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+0.5rem)] pb-5 flex justify-between items-center max-w-2xl mx-auto">
                    <div className="flex items-center gap-4">
                        <div className="size-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
                            <img src="/site-icon-rack-white.svg" alt="L" className="size-6 object-contain" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="font-black text-white uppercase tracking-tighter leading-none text-lg italic">Manfredonia</h1>
                            <span className="text-[7px] font-black text-blue-500/60 uppercase tracking-[0.5em] mt-1">Tactical_Mobile_Node</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setNotificationsOpen(!notificationsOpen)}
                        className={`size-10 rounded-full border border-white/10 flex items-center justify-center transition-all active:scale-90 ${notificationsOpen ? 'bg-white text-black' : 'bg-white/5 text-white'}`}
                    >
                        <span className="material-symbols-outlined text-xl">
                            {unreadCount > 0 ? 'notifications_active' : 'notifications'}
                        </span>
                        {unreadCount > 0 && !notificationsOpen && (
                            <span className="absolute top-0 right-0 size-2 bg-red-500 rounded-full border-2 border-black" />
                        )}
                    </button>
                </div>
            </header>

            {/* Notifications Dropdown */}
            <AnimatePresence>
                {notificationsOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm"
                            onClick={() => setNotificationsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            className="fixed inset-x-6 top-[calc(env(safe-area-inset-top,1.5rem)+5rem)] z-[90] bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-w-md mx-auto"
                        >
                            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Intel_Alerts</span>
                                <button onClick={() => markAllBannersAsRead(enabledBanners.map(b => b.id))} className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Clear_Log</button>
                            </div>
                            <div className="max-h-[50vh] overflow-y-auto divide-y divide-white/5">
                                {enabledBanners.length === 0 ? (
                                    <div className="p-12 text-center text-white/20 text-[10px] font-black uppercase tracking-widest italic">No_Intel_Detected</div>
                                ) : (
                                    enabledBanners.map(banner => (
                                        <div key={banner.id} className="p-5 flex gap-4 transition-colors hover:bg-white/[0.02]">
                                            <span className="material-symbols-outlined text-blue-500/60">{banner.icon || 'info'}</span>
                                            <div className="flex flex-col gap-1">
                                                <h4 className="text-[11px] font-black uppercase tracking-tight">{banner.title}</h4>
                                                <p className="text-[10px] text-white/40 leading-snug line-clamp-2">{banner.message.replace(/<[^>]*>?/gm, '')}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <main className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+7rem)] flex flex-col gap-8 max-w-2xl mx-auto">
                {/* Global Title Signature */}
                <section className="mb-4">
                    <h1 className="text-6xl font-black leading-none tracking-[-0.05em] text-white uppercase italic opacity-20 select-none">
                        MANFRE<span className="not-italic opacity-20">DONIA</span>
                    </h1>
                </section>
                {/* Hero Module */}
                <motion.section
                    initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                    className="relative p-8 rounded-2xl border border-white/10 bg-[#0A0A0A]/60 backdrop-blur-xl overflow-hidden shadow-2xl group"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent" />
                    <div className="relative z-10 flex flex-col gap-2">
                        <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.5em]">System_Identity</span>
                        <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none drop-shadow-2xl">
                            {config?.siteInfo?.title || 'System_Uplink'}
                        </h2>
                        <div className="flex items-center gap-3 mt-4">
                            <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg flex items-center gap-2">
                                <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                <span className="text-[9px] font-black text-white/60 tracking-widest uppercase">REV_{latestVersion || '4.0'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="absolute top-6 right-8 opacity-10">
                        <img src="/site-icon-rack-white.svg" alt="" className="size-24 rotate-12" />
                    </div>
                </motion.section>

                {/* Status Bento Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 rounded-2xl border border-white/10 bg-[#0A0A0A]/40 backdrop-blur-md flex flex-col gap-3">
                        <span className="material-symbols-outlined text-blue-500 scale-75 origin-left">sensors</span>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">State</span>
                            <span className={`text-sm font-black uppercase italic ${serverStatus.online ? 'text-emerald-400' : 'text-red-500'}`}>{serverStatus.statusText}</span>
                        </div>
                    </div>
                    <div className="p-6 rounded-2xl border border-white/10 bg-[#0A0A0A]/40 backdrop-blur-md flex flex-col gap-3" onClick={copyIp}>
                        <span className="material-symbols-outlined text-purple-500 scale-75 origin-left">content_copy</span>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Uplink</span>
                            <span className="text-sm font-black text-white uppercase italic truncate">Copy_IP</span>
                        </div>
                    </div>
                </div>

                {/* Countdown / Operations Module */}
                {config?.countdown?.enabled && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent flex flex-col items-center gap-6">
                        <div className="px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center gap-2 group">
                            <span className="size-1.5 rounded-full bg-red-500 group-hover:animate-ping" />
                            <span className="text-[9px] font-black text-white/60 uppercase tracking-[0.4em]">{config.countdown.title}</span>
                        </div>
                        <Countdown />
                    </motion.div>
                )}

                {/* Quick Info Terminal */}
                <section className="p-6 rounded-2xl border border-white/5 bg-black/40 font-mono text-[9px] text-white/20 leading-relaxed uppercase tracking-widest overflow-hidden">
                    <div className="flex flex-col gap-1 mb-4">
                        <div className="flex justify-between"><span>Session_Established</span> <span className="text-emerald-500/30">TRUE</span></div>
                        <div className="flex justify-between"><span>Protocol_Version</span> <span className="text-blue-500/30">TAC_V4.2</span></div>
                    </div>

                    {/* Integrated Audit Feed */}
                    <div className="mt-4 pt-4 border-t border-white/5 space-y-1">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[8px] opacity-40">Handshake_Feed</span>
                            <span className="size-1 rounded-full bg-blue-500 animate-pulse" />
                        </div>
                        {logs.map((log, i) => (
                            <div key={i} className={`flex gap-2 font-mono text-[8px] lowercase tracking-normal ${log.color || 'text-white/30'}`}>
                                <span className="opacity-20 shrink-0">{log.time}</span>
                                <span className="font-black shrink-0">{log.tag}</span>
                                <span className="truncate">{log.msg}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
};

export default AppHome;
