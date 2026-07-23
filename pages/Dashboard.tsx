import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { getLatestRelease } from '../utils/githubCache';
import LiveTerminal from '../components/LiveTerminal';
import { motion, AnimatePresence } from 'framer-motion';
import { TerminalSidebar } from '../components/terminal/TerminalSidebar';

const DEBUG_DASHBOARD = false;
const debugLog = (...args: any[]) => {
  if (DEBUG_DASHBOARD) console.log(...args);
};

const Dashboard: React.FC = () => {
  const { config, loading: configLoading, isDashboardGloballyEnabled } = useConfig();
  const { user, mcssService, loading: authLoading, logout, setAuthModalOpen } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState<{
    online: boolean;
    players?: { online: number; max: number };
    cpu?: number;
    ram?: number;
    latency?: number;
    statusText?: string;
    isUnreachable?: boolean;
  }>({ online: false, statusText: 'SYNCING', isUnreachable: true });
  const [serverId, setServerId] = useState<string | null>(null);
  const [latestRelease, setLatestRelease] = useState<string>('...');
  const [logs, setLogs] = useState<{ time: string; tag: string; msg: string; color?: string }[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [gracePassed, setGracePassed] = useState(false);

  // Terminal Sidebar Data (Placeholders for now)
  const clientIp = 'SCN_PROT_V4';
  const geoInfo = 'EUR_HUB_NORTH';
  const buildRef = '1.2.0-TAC';
  const geoCoords = { lat: 41.8, lon: 15.9 };

  const addLog = useCallback((tag: string, msg: string, color?: string) => {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-4), { time: `[${time}]`, tag, msg, color }]);
  }, []);

  const fetchDetailedStats = useCallback(async () => {
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
        const [stats, servers] = await Promise.all([
          mcssService.getServerStats(currentServerId),
          mcssService.getServers()
        ]);
        const latency = Date.now() - startTime;
        const server = servers.find(s => s.serverId === currentServerId);

        const statusMap: { [key: number]: string } = {
          0: 'OFFLINE', 1: 'ONLINE', 2: 'RESTARTING', 3: 'STARTING', 4: 'STOPPING'
        };

        const effectiveStatus = stats.status ?? server?.status ?? 0;

        setServerStatus({
          online: effectiveStatus === 1,
          statusText: statusMap[effectiveStatus] || 'UNKNOWN',
          cpu: stats.cpuUsage,
          ram: stats.ramUsage,
          players: { online: stats.onlinePlayers, max: stats.maxPlayers },
          latency: latency,
          isUnreachable: false
        });
      }
    } catch (err: any) {
      // console.warn('❌ [DASHBOARD] MCSS Uplink Failed:', err.message || err);
      setServerStatus(prev => ({
        ...prev,
        isUnreachable: true,
        statusText: 'UNREACHABLE'
      }));
    }
  }, [mcssService, serverId]);

  useEffect(() => {
    const init = async () => {
      try {
        if (mcssService) await fetchDetailedStats();
        if (config?.github?.repository) {
          const githubData = await getLatestRelease(config.github.repository);
          setLatestRelease(githubData.tag_name || 'v1.0.0');
        }
      } catch (err) { } finally {
        setLoading(false);
      }
    };
    if (!configLoading && !authLoading) init();
  }, [config, configLoading, authLoading, mcssService, fetchDetailedStats]);

  useEffect(() => {
    const timer = setTimeout(() => setGracePassed(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user || loading) return;

    // Aggressive Backoff: If unreachable, poll much slower (5 mins) to avoid console noise
    const intervalTime = serverStatus.isUnreachable ? 300000 : 5000;

    const interval = setInterval(() => {
      if (mcssService) {
        fetchDetailedStats();
      } else if (!authLoading) {
        setServerStatus(prev => ({
          ...prev,
          isUnreachable: true,
          statusText: 'HOST LOST'
        }));
      }
    }, intervalTime);
    return () => clearInterval(interval);
  }, [mcssService, user, loading, authLoading, fetchDetailedStats, serverStatus.isUnreachable]);

  useEffect(() => {
    // Only open the modal if we are definitely NOT loading and definitely NOT logged in
    // This prevents the flicker if there's a tiny gap between sign-in and user profile sync
    if (!authLoading && !user) {
      setAuthModalOpen(true);
    }
  }, [user, authLoading, setAuthModalOpen]);

  const handleServerAction = async (action: string) => {
    if (!mcssService || !serverId || actionLoading) return;
    setActionLoading(action);
    addLog('CMD:', `Exec ${action.toUpperCase()}...`, 'text-orange-400');
    try {
      await mcssService.executeAction(serverId, action);
      addLog('OK:', `${action.toUpperCase()} acknowledge.`, 'text-emerald-400');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await fetchDetailedStats();
    } catch (err: any) {
      addLog('ERR:', `Failed: ${err.message}`, 'text-red-400');
      if (err.message.includes('fetch') || err.message.includes('Network')) {
        setServerStatus(prev => ({ ...prev, isUnreachable: true }));
      }
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (serverStatus.isUnreachable) {
      debugLog('%c[DASHBOARD] Status: UNREACHABLE', 'color: #ff4444; font-weight: bold;');
    } else {
      debugLog('%c[DASHBOARD] Status: CONNECTED', 'color: #44ff44; font-weight: bold;');
    }
  }, [serverStatus.isUnreachable]);

  if (configLoading || authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4">
          <div className="size-16 border-b-2 border-purple-500 rounded-full animate-spin"></div>
          <span className="text-xs font-mono text-purple-500/40 uppercase tracking-[0.3em]">Bridging_Node...</span>
        </div>
      </div>
    );
  }

  if (!user || (!user.isApproved && !user.isAdmin)) {
    const title = !user ? 'Secure Login Required' : 'Approval Pending';
    const subtitle = !user ? 'Access to the dashboard is restricted.' : 'Administrator verification required for uplink.';
    const buttonText = !user ? 'Establish Connection' : 'Logout Session';
    const handleAction = !user ? () => setAuthModalOpen(true) : () => logout();

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center py-40 gap-8 animate-in fade-in zoom-in duration-500">
        <div className="relative group">
          <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full group-hover:bg-white/10 transition-colors"></div>
          <div className="relative size-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 shadow-2xl">
            <span className="material-symbols-outlined text-5xl group-hover:scale-110 transition-transform">
              {!user ? 'lock_open' : 'verified_user'}
            </span>
          </div>
          <div className={`absolute -top-1 -right-1 size-4 ${!user ? 'bg-red-500' : 'bg-amber-500'} rounded-full border-4 border-[#050505]`}></div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-4xl font-black uppercase tracking-tighter text-white italic">
            {title}
          </h2>
          <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.4em] leading-relaxed max-w-xs mx-auto">
            {subtitle}
          </p>
        </div>

        <button
          onClick={handleAction}
          className="relative px-10 py-4 bg-white text-black font-black uppercase text-[10px] tracking-[0.4em] rounded-xl hover:bg-gray-200 transition-all active:scale-95 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
          <span className="relative z-10 flex items-center gap-3">
            {buttonText}
            <span className="material-symbols-outlined text-sm">{!user ? 'sensors' : 'logout'}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-8 relative select-none">
      {/* GLOBAL HEADER */}
      <section className="relative pt-4 pb-2 flex flex-col items-center text-center">
        <div className="flex flex-col gap-4 relative">
          <h1 className="text-7xl md:text-[120px] font-black leading-none tracking-[-0.05em] text-white uppercase italic drop-shadow-[0_10px_50px_rgba(255,255,255,0.1)]">
            DASH<span className="text-white/10 not-italic">BOARD</span>
          </h1>
        </div>
      </section>

      {!user.isApproved ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl glass-card rounded-2xl border border-white/10 bg-[#050505]/60 p-12 text-center relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"></div>
            <div className="flex flex-col gap-6 relative z-10">
              <div className="size-20 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(168,85,247,0.2)] border border-purple-500/20">
                <span className="material-symbols-outlined text-4xl animate-pulse">lock_person</span>
              </div>
              <div className="flex flex-col gap-3">
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Restricted <span className="text-white/30">Access</span></h2>
                <p className="text-sm font-mono text-white/40 uppercase tracking-[0.3em] leading-relaxed max-md mx-auto">
                  Your identity is verified, but you are <span className="text-purple-400">waiting for clearance</span> from the administrator.
                </p>
              </div>
              <div className="h-px bg-white/5 w-24 mx-auto"></div>
              <div className="flex flex-col gap-2">
                <p className="text-[8px] font-mono text-white/20 uppercase tracking-[0.4em]">
                  Status: PENDING_APPROVAL
                </p>
                <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">
                  Contact the admin to unlock your private dashboard.
                </p>
              </div>
              <button
                onClick={logout}
                className="mt-4 px-8 py-3 bg-white/5 border border-white/10 rounded-2xl text-white/40 font-black uppercase text-[10px] tracking-[0.4em] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all mx-auto"
              >
                Logout
              </button>
            </div>
          </motion.div>
        </div>
      ) : (!isDashboardGloballyEnabled && !user.isAdmin) ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl glass-card rounded-2xl border border-red-500/20 bg-[#050505]/60 p-12 text-center relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
            <div className="flex flex-col gap-6 relative z-10">
              <div className="size-20 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(239,68,68,0.2)] border border-red-500/20">
                <span className="material-symbols-outlined text-4xl animate-pulse">sensors_off</span>
              </div>
              <div className="flex flex-col gap-3">
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">Uplink <span className="text-red-500/50">Restricted</span></h2>
                <p className="text-sm font-mono text-white/40 uppercase tracking-[0.3em] leading-relaxed max-md mx-auto">
                  The central command dashboard is currently <span className="text-red-400">offline for maintenance</span> or restricted by the administrator.
                </p>
              </div>
              <div className="h-px bg-white/5 w-24 mx-auto"></div>
              <div className="flex flex-col gap-2">
                <p className="text-[8px] font-mono text-white/20 uppercase tracking-[0.4em]">
                  Status: SYSTEM_MAINTENANCE_ACTIVE
                </p>
                <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">
                  Please wait for the signal to be restored.
                </p>
              </div>
              <button
                onClick={logout}
                className="mt-4 px-8 py-3 bg-white/5 border border-white/10 rounded-2xl text-white/40 font-black uppercase text-[10px] tracking-[0.4em] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 transition-all mx-auto"
              >
                Logout
              </button>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* LEFT COLUMN (3/12): QUICK ACTIONS & STATS */}
          <div className="lg:col-span-3 flex flex-col gap-6 lg:h-[600px]">
            {/* IDENTITY CARD */}
            <div className="glass-card rounded-2xl p-1 border border-white/10 bg-white/[0.02] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] shrink-0">
              <div className="rounded-xl bg-[#050505] p-4 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="size-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg shadow-purple-500/20 flex items-center justify-center font-black text-white text-sm">
                      {user.username.charAt(0)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 size-3 bg-emerald-500 border-2 border-[#050505] rounded-full"></div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-black text-white uppercase tracking-widest leading-tight">{user.username}</span>
                    <span className="text-[9px] font-mono text-white/30 uppercase tracking-tighter">{user.isAdmin ? 'Admin User' : 'Standard User'} • REF: INTEL-001</span>
                  </div>
                </div>
                <div className="h-px bg-white/5 w-full"></div>
                <button
                  onClick={logout}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 transition-all flex items-center justify-center gap-2 group"
                >
                  <span className="material-symbols-outlined text-[16px] text-white/20 group-hover:text-red-400 transition-colors">logout</span>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 group-hover:text-red-400 transition-colors">Logout</span>
                </button>
              </div>
            </div>

            {/* QUICK ACTIONS */}
            <div className="flex flex-col gap-1.5 shrink-0">
              {[
                { label: 'Issue Report', target: '/utilities', color: 'from-orange-500/10', icon: 'bug_report' },
                { label: 'Brainstorm', target: '/utilities', color: 'from-purple-500/10', icon: 'psychology' },
                { label: 'Roadmap', target: '/utilities', color: 'from-emerald-500/10', icon: 'map' },
                { label: 'Assets Hub', target: '/modpack', color: 'from-blue-500/10', icon: 'folder_open' }
              ].map(act => (
                <button
                  key={act.label}
                  onClick={() => navigate(act.target)}
                  className="relative group py-2.5 px-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all text-left flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 relative z-10">
                    <span className="material-symbols-outlined text-sm text-white/20 group-hover:text-white transition-colors">{act.icon}</span>
                    <span className="text-[10px] font-black text-white/30 group-hover:text-white uppercase tracking-[0.2em] transition-colors">{act.label}</span>
                  </div>
                  <span className="material-symbols-outlined text-[10px] text-white/10 group-hover:translate-x-1 transition-transform relative z-10">arrow_forward_ios</span>
                </button>
              ))}
            </div>

            {/* TELEMETRY MINI */}
            <div className="flex-1 glass-card rounded-2xl border border-white/10 bg-[#050505]/60 backdrop-blur-md overflow-hidden flex flex-col shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
              <div className="px-5 py-3.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-sm text-blue-500">monitoring</span>
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Resource Stats [GRID-09]</span>
                </div>
                <div className="size-2 rounded-full bg-blue-500 animate-pulse"></div>
              </div>
              <div className="p-5 flex flex-col justify-around flex-1">
                {[
                  { label: 'CPU LOAD', value: serverStatus.cpu || 0, color: 'bg-orange-500' },
                  { label: 'RAM USE', value: serverStatus.ram || 0, color: 'bg-purple-500' },
                  { label: 'ACTIVE NODES', value: ((serverStatus.players?.online || 0) / (serverStatus.players?.max || 1)) * 100, color: 'bg-emerald-500', text: `${serverStatus.players?.online || 0}/${serverStatus.players?.max || 0}` }
                ].map(stat => (
                  <div key={stat.label} className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[9px] font-mono leading-none">
                      <span className="text-white/20 uppercase tracking-widest">{stat.label}</span>
                      <span className="text-white/70 font-black">{stat.text || `${stat.value}%`}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${stat.color} shadow-[0_0_15px_rgba(255,255,255,0.1)]`}
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.value}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER COLUMN (6/12): TERMINAL */}
          <div className="lg:col-span-6 flex flex-col lg:h-[600px]">
            <div className="flex-1 glass-card rounded-2xl border border-white/10 bg-[#030303]/80 backdrop-blur-xl overflow-hidden shadow-[0_0_50px_-20px_rgba(0,0,0,0.5)] flex flex-col relative group">
              <div className="px-6 py-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="size-2 rounded-full bg-orange-500/20 border border-orange-500/50"></div>
                    <div className="size-2 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                  </div>
                  <span className="text-xs font-mono text-white/30 ml-2">console@manfredonia:~</span>
                </div>
                <div className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-white/40">
                  {latestRelease}
                </div>
              </div>
              <div className="flex-1 relative min-h-0 bg-black/40 flex flex-col">
                {/* Graceful Uplink Overlay */}
                <AnimatePresence>
                  {(serverStatus.isUnreachable || !gracePassed) && (
                    <motion.div
                      key="uplink-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505]/70 backdrop-blur-[2px] p-8 text-center"
                    >
                      {!gracePassed ? (
                        /* Premium Tactical Loading State */
                        <div className="flex flex-col items-center gap-6 w-72">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center gap-3">
                              <div className="size-1 rounded-full bg-emerald-500 animate-ping"></div>
                              <span className="text-[11px] font-mono font-black text-emerald-400 uppercase tracking-[0.4em] drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">Establishing Tactical Uplink</span>
                              <div className="size-1 rounded-full bg-emerald-500 animate-ping"></div>
                            </div>
                            <div className="flex items-center gap-4 opacity-20 group">
                              <span className="text-[8px] font-mono text-white tracking-widest animate-pulse">DH_KEY_EXCHANGE</span>
                              <span className="text-[8px] font-mono text-white tracking-widest">•</span>
                              <span className="text-[8px] font-mono text-white tracking-widest animate-pulse [animation-delay:0.5s]">SYNC_NODES v2.2</span>
                            </div>
                          </div>

                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative shadow-inner backdrop-blur-sm">
                            <motion.div
                              animate={{ x: ["-100%", "200%"] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent z-10"
                            />

                            <motion.div
                              initial={{ width: "0%" }}
                              animate={{ width: "100%" }}
                              transition={{ duration: 4, ease: [0.65, 0, 0.35, 1] }}
                              className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-600 shadow-[0_0_20px_rgba(52,211,153,0.4)] relative"
                            >
                              <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-white shadow-[0_0_10px_#fff]" />
                            </motion.div>
                          </div>

                          <div className="flex justify-between w-full px-2 opacity-30">
                            <span className="text-[8px] font-mono text-white uppercase tracking-tighter">MCSS_PROPORT_SECURE</span>
                            <div className="flex items-center gap-1.5 font-mono text-[8px] text-white">
                              <span>STATUS:</span>
                              <span className="text-emerald-400">HANDSHAKE_OK</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Minimalist Lost State */
                        <div className="flex flex-col items-center gap-6">
                          <div className="flex flex-col items-center gap-3">
                            <div className="size-12 rounded-full border border-red-500/20 flex items-center justify-center text-red-500/40">
                              <span className="material-symbols-outlined text-2xl">link_off</span>
                            </div>
                            <div className="flex flex-col items-center">
                              <h3 className="text-xs font-black text-white/50 uppercase tracking-[0.3em] italic">Signal Lost</h3>
                              <span className="text-[8px] font-mono text-red-500/40 uppercase tracking-widest mt-1">Retrying_Uplink...</span>
                            </div>
                            <div className="mt-4 px-6 py-3 bg-white/5 border border-white/10 rounded-xl max-w-[320px] text-center">
                              <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.1em] leading-relaxed">
                                Il server potrebbe essere offline. <br /> Assicurati di non essere al di fuori dell'orario operativo.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Main Console Area */}
                <div className="flex-1 relative min-h-0">
                  <LiveTerminal serverOnline={!serverStatus.isUnreachable && serverStatus.statusText !== 'SYNCING'} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (3/12): POWER & INFO */}
          <div className="lg:col-span-3 flex flex-col gap-6 lg:h-[600px]">
            {/* POWER MODULE */}
            <div className="flex-1 glass-card rounded-2xl p-1 border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)]">
              <div className="h-full rounded-xl bg-[#050505] overflow-hidden p-6 flex flex-col gap-8 items-center justify-center text-center relative">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                <div className={`w-full py-4 px-6 rounded-2xl border transition-all duration-500 flex items-center justify-between group/status shrink-0 relative z-10 ${serverStatus.statusText === 'ONLINE' ? 'bg-emerald-500/[0.03] border-emerald-500/20 shadow-[0_0_30px_-10px_rgba(16,185,129,0.2)]' :
                  serverStatus.statusText === 'OFFLINE' ? 'bg-red-500/[0.03] border-red-500/20 shadow-[0_0_30px_-10px_rgba(239,68,68,0.2)]' :
                    'bg-orange-500/[0.03] border-orange-500/20 shadow-[0_0_30px_-10px_rgba(245,158,11,0.2)]'
                  }`}>
                  <div className="flex items-center gap-4">
                    <div className="relative flex items-center justify-center">
                      <div className={`size-2.5 rounded-full bg-current shadow-[0_0_15px_currentColor] animate-pulse ${serverStatus.statusText === 'ONLINE' ? 'text-emerald-500' :
                        serverStatus.statusText === 'OFFLINE' ? 'text-red-500' :
                          'text-orange-500'
                        }`}></div>
                      <div className={`absolute -inset-2 rounded-full border border-current opacity-10 animate-ping ${serverStatus.statusText === 'ONLINE' ? 'text-emerald-500' :
                        serverStatus.statusText === 'OFFLINE' ? 'text-red-500' :
                          'text-orange-500'
                        }`}></div>
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.3em] leading-none mb-1">Status</span>
                      <span className={`text-sm font-black uppercase italic tracking-wider leading-none ${serverStatus.isUnreachable ? 'text-red-500' :
                        serverStatus.statusText === 'ONLINE' ? 'text-emerald-400' :
                          serverStatus.statusText === 'OFFLINE' ? 'text-red-400' :
                            'text-orange-400'
                        }`}>{serverStatus.isUnreachable ? 'HOST LOST' : serverStatus.statusText}</span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-white/5"></div>
                  <div className="flex flex-col text-right">
                    <span className="text-[9px] font-mono text-white/20 uppercase tracking-[0.3em] leading-none mb-1">Latency</span>
                    <span className="text-sm font-mono text-white/60 uppercase tracking-widest leading-none font-bold">
                      {serverStatus.latency ? `${serverStatus.latency}ms` : 'SYNCING'}
                    </span>
                    <span className="text-[8px] font-mono text-white/10 uppercase mt-auto">SN: CORE-X7</span>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-3 flex-1 justify-center max-w-[260px] relative z-10">
                  {[
                    { id: 'Start', label: 'START', icon: 'play_arrow', color: 'hover:bg-emerald-500 hover:text-white hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]', disabled: serverStatus.statusText !== 'OFFLINE' },
                    { id: 'Stop', label: 'STOP', icon: 'square', color: 'hover:bg-red-500 hover:text-white hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]', disabled: serverStatus.statusText !== 'ONLINE' },
                    { id: 'Restart', label: 'RESTART', icon: 'restart_alt', color: 'hover:bg-orange-500 hover:text-white hover:shadow-[0_0_40px_rgba(245,158,11,0.4)]', disabled: serverStatus.statusText !== 'ONLINE' }
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => handleServerAction(btn.id)}
                      disabled={btn.disabled || !!actionLoading || serverStatus.isUnreachable}
                      className={`group relative w-full py-4 px-6 rounded-xl border border-white/5 bg-white/[0.02] transition-all flex items-center justify-between overflow-hidden ${(btn.disabled || !!actionLoading || serverStatus.isUnreachable) ? 'opacity-10 cursor-not-allowed grayscale' : `hover:bg-white/[0.05] cursor-pointer active:scale-[0.98]`
                        }`}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <span className="text-[13px] font-black tracking-[0.4em] uppercase text-white/30 group-hover:text-white transition-colors relative z-10">{btn.label}</span>
                      <div className={`size-10 rounded-xl flex items-center justify-center transition-all ${btn.color} text-white/10 group-hover:text-white relative z-10 shadow-inner`}>
                        <span className="material-symbols-outlined text-[22px]">{btn.icon}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* TIPS / INFO */}
            <div className="p-5 rounded-2xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col gap-3.5 shrink-0">
              <div className="flex items-start gap-3.5 opacity-50">
                <span className="material-symbols-outlined text-base text-blue-500">security</span>
                <p className="text-[11px] text-white/40 leading-relaxed font-mono uppercase tracking-tight">
                  Secure Uplink Established. All commands are <span className="text-white/60">Logged and Audited</span>.
                </p>
              </div>
              <div className="flex items-start gap-3.5 opacity-50">
                <span className="material-symbols-outlined text-base text-purple-500">hub</span>
                <p className="text-[11px] text-white/40 leading-relaxed font-mono uppercase tracking-tight">
                  Remote PORT: <span className="text-white/60">25560</span>. Link status: <span className="text-emerald-500">SYNCED</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
