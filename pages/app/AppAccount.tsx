import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

const AppAccount: React.FC = () => {
    const { user, loading: authLoading, updateProfile, logout, unlockedIntelIds } = useAuth();
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [newUsername, setNewUsername] = useState(user?.username || '');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        StatusBar.setStyle({ style: Style.Dark });
        const handleScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newUsername === user?.username) return;
        setUpdating(true);
        try {
            await updateProfile({ username: newUsername });
            await Haptics.notification({ type: NotificationType.Success });
        } catch (err) {
            await Haptics.notification({ type: NotificationType.Error });
        } finally {
            setUpdating(false);
        }
    };

    const handleLogout = async () => {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        logout();
        navigate('/');
    };

    if (authLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white font-black uppercase tracking-[0.4em] animate-pulse text-[10px]">Syncing_Identity</div>;
    }

    if (!user) return null;

    return (
        <div className="bg-[#050505] min-h-screen text-white font-sans overflow-x-hidden pb-40">
            {/* Background mirroring MobileAccount */}
            <div className="fixed inset-x-0 top-0 h-[400px] bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.08)_0%,transparent_70%)] pointer-events-none" />
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01)_0%,transparent_80%)] pointer-events-none" />

            {/* Header: Safe Area Aware */}
            <header className={`fixed top-0 left-0 w-full z-[80] transition-all duration-300 ${scrolled ? 'bg-black/80 backdrop-blur-2xl border-b border-white/5 shadow-2xl' : 'bg-transparent'}`}>
                <div className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+0.5rem)] pb-5 max-w-2xl mx-auto flex items-center gap-4">
                    <div className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
                        <span className="material-symbols-outlined text-lg text-purple-400">shield_person</span>
                    </div>
                    <h1 className="font-black text-white uppercase tracking-tighter text-lg italic leading-none">Identity_Terminal</h1>
                </div>
            </header>

            <main className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+7rem)] flex flex-col gap-8 max-w-2xl mx-auto relative z-10">
                {/* Global Title Signature */}
                <section className="mb-4">
                    <h1 className="text-6xl font-black leading-none tracking-[-0.05em] text-white uppercase italic opacity-20 select-none">
                        IDEN<span className="not-italic opacity-20">TITY</span>
                    </h1>
                </section>

                {/* Identity Card: High-Parity Web Style */}
                <div className="w-full bg-[#0A0A0A]/60 rounded-2xl border border-white/10 p-6 relative overflow-hidden shadow-2xl backdrop-blur-xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full translate-x-12 -translate-y-12" />

                    <div className="flex items-center gap-6 relative z-10">
                        {/* Avatar Node */}
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="size-20 shrink-0 rounded-full border-2 border-white/10 bg-black p-1 relative">
                                <div className="w-full h-full rounded-full overflow-hidden bg-white/5 flex items-center justify-center">
                                    {user.avatar_url ? (
                                        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="material-symbols-outlined text-4xl opacity-10">person_active</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-3xl font-black text-white italic tracking-tighter leading-none truncate">{user.username}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[8px] font-black text-purple-400 uppercase tracking-[0.3em] bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                                        Operative_Class_A
                                    </span>
                                </div>
                            </div>

                            {/* XP Progress Bar Parity */}
                            <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between items-end">
                                    <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Clearance_Level</span>
                                    <span className="text-[10px] font-mono font-black text-purple-400">LVL {user.clearance_level || 0}</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, (user.clearance_level || 0) * 10)}%` }}
                                        className="h-full bg-gradient-to-r from-purple-600 to-blue-500 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Operations Terminal */}
                <div className="flex flex-col gap-6">
                    <div className="space-y-3">
                        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 px-4">Modify_Codename</span>
                        <div className="p-2 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-2">
                            <input
                                type="text"
                                value={newUsername}
                                onChange={e => setNewUsername(e.target.value)}
                                placeholder="Enter_New_ID"
                                className="w-full bg-black/60 border border-white/5 rounded-2xl h-14 px-5 text-sm font-bold text-white outline-none focus:border-purple-500/40 transition-all placeholder:text-white/10"
                            />
                            <button
                                onClick={handleUpdateProfile}
                                disabled={updating || newUsername === user.username}
                                className="w-full h-14 bg-white text-black rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] active:scale-[0.98] transition-all shadow-2xl disabled:opacity-10"
                            >
                                {updating ? 'Committing...' : 'Commit_ID_Change'}
                            </button>
                        </div>
                    </div>

                    {/* Stats Bento */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#0A0A0A]/40 border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none">Satellite_Feed</span>
                            <div className="flex items-center gap-2">
                                <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs font-black text-white uppercase italic">Active</span>
                            </div>
                        </div>
                        <div className="bg-[#0A0A0A]/40 border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none">Unlocked_Intel</span>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-xs text-blue-500">folder_open</span>
                                <span className="text-xs font-black text-white uppercase italic">{unlockedIntelIds?.length || 0} Files</span>
                            </div>
                        </div>
                    </div>

                    {/* Security Actions */}
                    <div className="flex flex-col gap-3">
                        <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 px-4 mt-4">Security_Protocols</span>
                        <button
                            onClick={handleLogout}
                            className="w-full group flex items-center justify-between p-6 bg-red-500/[0.03] border border-red-500/10 rounded-2xl transition-all hover:bg-red-500/[0.08] active:scale-[0.98]"
                        >
                            <div className="flex items-center gap-4">
                                <div className="size-10 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                                    <span className="material-symbols-outlined text-xl">power_settings_new</span>
                                </div>
                                <span className="font-black uppercase tracking-[0.3em] text-[11px] text-red-500/80">Terminate_Session</span>
                            </div>
                            <span className="material-symbols-outlined text-sm text-red-500/20 group-hover:translate-x-1 transition-transform">chevron_right</span>
                        </button>
                    </div>
                </div>

                {/* Technical Footnote */}
                <div className="flex flex-col items-center gap-2 py-8 opacity-20">
                    <div className="h-px w-12 bg-white" />
                    <span className="text-[7px] font-mono tracking-[0.5em] uppercase">AES_256_ENCRYPTED_UPLINK</span>
                </div>
            </main>
        </div>
    );
};

export default AppAccount;
