
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';

interface UnlockedIntel {
    id: string;
    name: string;
    description?: string;
    image_url: string;
    unlock_code?: string;
}

const DEBUG_ACCOUNT = false;
const debugLog = (...args: any[]) => {
    if (DEBUG_ACCOUNT) console.log(...args);
};

const Account: React.FC = () => {
    const { user, updateProfile, updatePassword, uploadAvatar, verifyPassword, logout, unlockedIntelIds, setAuthModalOpen } = useAuth();
    const { config } = useConfig();
    const navigate = useNavigate();
    const [newUsername, setNewUsername] = useState(user?.username || '');
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [unlockedIntel, setUnlockedIntel] = useState<UnlockedIntel[]>([]);
    const [viewingIntel, setViewingIntel] = useState<UnlockedIntel | null>(null);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const [openedAssets, setOpenedAssets] = useState<Set<string>>(new Set()); // Track opened assets
    const [activeTab, setActiveTab] = useState<'identity' | 'security'>('identity');
    const carouselRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        window.scrollTo(0, 0);
        // Force a scroll event to notify observers (like Navbar)
        window.dispatchEvent(new Event('scroll'));
        if (user?.username && !newUsername) {
            setNewUsername(user.username);
        }

        // Load opened assets from localStorage
        const loadedOpened = localStorage.getItem('intel_assets_opened');
        if (loadedOpened) {
            try {
                const parsed = JSON.parse(loadedOpened);
                if (Array.isArray(parsed)) {
                    setOpenedAssets(new Set(parsed));
                }
            } catch (e) {
                console.error("Failed to parse opened assets", e);
            }
        }
    }, [user, newUsername]);

    useEffect(() => {
        const fetchUnlockedIntel = async () => {
            // Admins see ALL assets
            if (user?.isAdmin) {
                const { data, error } = await supabase
                    .from('intel_assets')
                    .select('*')
                    .order('id', { ascending: true });

                if (!error && data) {
                    setUnlockedIntel(data);
                }
                return;
            }

            if (unlockedIntelIds.length === 0) {
                setUnlockedIntel([]);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('intel_assets')
                    .select('*')
                    .in('id', unlockedIntelIds)
                    .order('id', { ascending: true }); // Show by ID since created_at might not exist

                if (error) throw error;
                if (data) {
                    setUnlockedIntel(data);
                }
            } catch (err) {
                console.error('Error fetching unlocked intel:', err);
            }
        };

        fetchUnlockedIntel();
    }, [unlockedIntelIds, user?.isAdmin]);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus(null);
        try {
            await updateProfile({ username: newUsername });
            setStatus({ type: 'success', msg: 'Profile updated successfully' });
        } catch (err: any) {
            console.error('handleUpdateProfile error:', err);
            setStatus({ type: 'error', msg: err.message || 'Error updating profile' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', msg: 'Passwords do not match' });
            return;
        }

        setLoading(true);
        setStatus(null);
        try {
            // Verify old password
            const isValid = await verifyPassword(oldPassword);
            if (!isValid) {
                throw new Error('Current password verification failed');
            }

            await updatePassword(newPassword);
            setStatus({ type: 'success', msg: 'Password updated successfully' });
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error('handleUpdatePassword error:', err);
            setStatus({ type: 'error', msg: err.message || 'Error updating password' });
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Client-side size check (2MB)
        if (file.size > 2 * 1024 * 1024) {
            setStatus({ type: 'error', msg: 'File size exceeds 2MB limit' });
            return;
        }

        setUploadingAvatar(true);
        setStatus(null);
        try {
            await uploadAvatar(file);
            setStatus({ type: 'success', msg: 'Avatar updated successfully' });
        } catch (err: any) {
            console.error('handleAvatarUpload error:', err);
            setStatus({ type: 'error', msg: err.message || 'Error uploading avatar' });
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        setAuthModalOpen(true);
        navigate('/');
    };

    if (!user || (!user.isApproved && !user.isAdmin)) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center p-6 text-center py-40 gap-8 animate-in fade-in zoom-in duration-500">
                <div className="relative group">
                    <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full"></div>
                    <div className="relative size-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 shadow-2xl">
                        <span className="material-symbols-outlined text-5xl group-hover:scale-110 transition-transform">
                            {!user ? 'lock_clock' : 'verified_user'}
                        </span>
                    </div>
                    <div className={`absolute -top-1 -right-1 size-4 ${!user ? 'bg-red-500' : 'bg-amber-500'} rounded-full border-4 border-[#050505]`}></div>
                </div>

                <div className="flex flex-col gap-3">
                    <h2 className="text-4xl font-black uppercase tracking-tighter text-white italic">
                        {!user ? 'Access' : 'Account'} <span className="text-white/20">Restricted</span>
                    </h2>
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.4em] leading-relaxed max-w-xs mx-auto">
                        {!user ? 'Please sign in to access your profile.' : 'Your identity is being verified by the network.'}
                    </p>
                </div>

                <button
                    onClick={!user ? () => setAuthModalOpen(true) : handleLogout}
                    className="relative px-10 py-4 bg-white text-black font-black uppercase text-[10px] tracking-[0.4em] rounded-xl hover:bg-gray-200 transition-all active:scale-95 group overflow-hidden"
                >
                    <span className="relative z-10 flex items-center gap-3">
                        {!user ? 'Initiate Session' : 'Logout Session'}
                        <span className="material-symbols-outlined text-sm">{!user ? 'login' : 'logout'}</span>
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative overflow-hidden flex flex-col pt-20 pb-12 -mt-20">
            {/* Background Decorations */}
            <div className="absolute inset-x-0 top-0 h-[800px] bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.2)_0%,transparent_75%)] pointer-events-none" />
            <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)] pointer-events-none" />

            <div className="max-w-5xl mx-auto w-full px-4 flex flex-col gap-12 relative select-none animate-in fade-in slide-in-from-top-10 duration-700 mt-20">
                {/* Header Section */}
                <div className="flex flex-col items-center text-center gap-6 relative py-12">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />

                    <div className="relative group perspective-1000">
                        {/* Brackets */}
                        <div className="absolute -inset-4 border-x border-white/10 flex justify-between pointer-events-none">
                            <div className="flex flex-col justify-between">
                                <span className="size-2 border-t border-l border-purple-500/50" />
                                <span className="size-2 border-b border-l border-purple-500/50" />
                            </div>
                            <div className="flex flex-col justify-between">
                                <span className="size-2 border-t border-r border-purple-500/50" />
                                <span className="size-2 border-b border-r border-purple-500/50" />
                            </div>
                        </div>

                        <div className="size-24 rounded-2xl bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] shadow-2xl flex items-center justify-center font-black text-white text-3xl italic overflow-hidden border border-white/10 group-hover:border-purple-500/30 transition-all duration-500 relative">
                            {user.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt={user.username}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                />
                            ) : (
                                <span className="relative z-10 group-hover:text-purple-400 transition-colors">{user.username.charAt(0).toUpperCase()}</span>
                            )}

                            {/* Scanner Line during upload */}
                            {uploadingAvatar && (
                                <div className="absolute inset-x-0 h-1 bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.8)] z-20 animate-scanner" />
                            )}
                        </div>

                        <div className="absolute -bottom-2 -right-2 size-7 bg-[#050505] rounded-lg border border-emerald-500/30 flex items-center justify-center shadow-lg">
                            <span className="material-symbols-outlined text-[16px] text-emerald-500 animate-pulse">verified</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-center gap-3">
                            <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter text-white">
                                Sync <span className="text-white/20">Protocol</span>
                            </h1>
                        </div>
                        <div className="flex items-center justify-center flex-wrap gap-4 mt-2">
                            <div className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[9px] font-mono text-purple-400 uppercase tracking-widest whitespace-nowrap">
                                [IDENT: {user.username}]
                            </div>
                            <div className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-white/30 uppercase tracking-widest whitespace-nowrap">
                                [UUID: {user.id.substring(0, 12)}...]
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Grid - BENTO LAYOUT */}
                <div className="flex flex-col gap-8">

                    {/* GRID WRAPPER: Config & Clearance */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                        {/* LEFT: Unified Operative Configuration */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-card rounded-2xl border border-white/10 relative overflow-hidden group h-full"
                        >
                            <div className="absolute top-0 left-0 size-8 border-t border-l border-white/20 rounded-tl-2xl pointer-events-none" />
                            <div className="absolute bottom-0 right-0 size-8 border-b border-r border-white/20 rounded-br-2xl pointer-events-none" />
                            <div className="absolute top-0 right-0 p-3 text-[8px] font-mono text-white/10 pointer-events-none uppercase tracking-[0.2em]">
                                MOD:CONFIG_CORE
                            </div>

                            <div className="px-8 py-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <div className={`size-8 rounded-lg border flex items-center justify-center transition-all ${activeTab === 'identity' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                                        <span className="material-symbols-outlined text-[18px]">{activeTab === 'identity' ? 'badge' : 'key'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="font-black uppercase tracking-widest text-xs text-white">Operative Config</h3>
                                        <span className="text-[9px] font-mono text-white/20 uppercase">Module: {activeTab === 'identity' ? 'AUTH_IDENT' : 'SEC_MATRIX'}</span>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="flex gap-1 p-1 bg-black/20 rounded-lg border border-white/5 self-start sm:self-auto">
                                    <button
                                        onClick={() => setActiveTab('identity')}
                                        className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'identity' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Identity
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('security')}
                                        className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === 'security' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                    >
                                        Security
                                    </button>
                                </div>
                            </div>

                            <div className="p-8">
                                {/* Status Alert UI */}
                                <AnimatePresence>
                                    {status && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                                            animate={{ height: 'auto', opacity: 1, marginBottom: 24 }}
                                            exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                                            className={`relative overflow-hidden rounded-xl border ${status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}
                                        >
                                            <div className="flex items-center gap-4 p-4">
                                                <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${status.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                    <span className="material-symbols-outlined text-xl">
                                                        {status.type === 'success' ? 'check_circle' : 'warning'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <div className={`text-[10px] font-black uppercase tracking-widest ${status.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {status.type === 'success' ? 'Status: Nominal' : 'Status: Alert'}
                                                    </div>
                                                    <p className="text-[11px] font-mono text-white/70 leading-relaxed uppercase tracking-tight">
                                                        {status.msg}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setStatus(null)}
                                                    className="ml-auto p-2 text-white/20 hover:text-white transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-lg">close</span>
                                                </button>
                                            </div>
                                            {/* Progress bar at the bottom */}
                                            {status.type === 'success' && (
                                                <motion.div
                                                    initial={{ width: '100%' }}
                                                    animate={{ width: 0 }}
                                                    transition={{ duration: 5, ease: "linear" }}
                                                    onAnimationComplete={() => setStatus(null)}
                                                    className="absolute bottom-0 left-0 h-0.5 bg-emerald-500/40"
                                                />
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <AnimatePresence mode="wait">
                                    {activeTab === 'identity' ? (
                                        <motion.div
                                            key="identity"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col gap-6"
                                        >
                                            <div className="flex flex-col gap-6">
                                                {/* Avatar Upload Block */}
                                                <div className="flex items-center gap-6 pb-6 border-b border-white/5">
                                                    <label className="relative block size-20 rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] group/upload cursor-pointer group-hover:border-purple-500/20 transition-all shrink-0">
                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            accept="image/*"
                                                            onChange={handleAvatarUpload}
                                                            disabled={uploadingAvatar}
                                                        />
                                                        {user.avatar_url ? (
                                                            <img src={user.avatar_url} className="w-full h-full object-cover opacity-60 group-hover/upload:opacity-80 transition-opacity" alt="" />
                                                        ) : (
                                                            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                                                <span className="material-symbols-outlined text-white/20 text-2xl">add_a_photo</span>
                                                            </div>
                                                        )}
                                                        {uploadingAvatar && (
                                                            <div className="absolute inset-0 bg-purple-500/10 flex items-center justify-center">
                                                                <div className="size-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                                                            </div>
                                                        )}
                                                    </label>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-white/50">Visual Uplink</div>
                                                        <div className="text-[9px] font-mono text-white/20 leading-relaxed">Update your neural representation. Max 2MB.</div>
                                                    </div>
                                                </div>

                                                <form onSubmit={handleUpdateProfile} className="flex flex-col gap-6">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                                                                <span className="size-1 rounded-full bg-purple-500" />
                                                                Username
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={newUsername}
                                                                onChange={(e) => setNewUsername(e.target.value)}
                                                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:bg-white/[0.05] focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 outline-none transition-all placeholder:text-white/10"
                                                                placeholder="Enter new codename..."
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2 opacity-50">
                                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                                                                <span className="size-1 rounded-full bg-white/20" />
                                                                Email Address
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={user.email}
                                                                disabled
                                                                className="w-full bg-white/0 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white/40 cursor-not-allowed outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end pt-4 border-t border-white/5">
                                                        <button
                                                            disabled={loading || newUsername === user.username}
                                                            className="group relative px-6 py-3 rounded-xl bg-white text-black font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white/90 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                                                        >
                                                            <span className="relative z-10">Authorize Change</span>
                                                        </button>
                                                    </div>
                                                </form>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.form
                                            key="security"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.2 }}
                                            onSubmit={handleUpdatePassword}
                                            className="flex flex-col gap-8"
                                        >
                                            <div className="grid grid-cols-1 gap-6">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Primary Session Key (Current)</label>
                                                    <div className="relative">
                                                        <input
                                                            type={showOldPassword ? "text" : "password"}
                                                            value={oldPassword}
                                                            onChange={(e) => setOldPassword(e.target.value)}
                                                            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:bg-white/[0.05] focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-white/10 pr-12"
                                                            placeholder="••••••••"
                                                            required
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowOldPassword(!showOldPassword)}
                                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">
                                                                {showOldPassword ? 'visibility_off' : 'visibility'}
                                                            </span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">New Security Sequence</label>
                                                        <div className="relative">
                                                            <input
                                                                type={showNewPassword ? "text" : "password"}
                                                                value={newPassword}
                                                                onChange={(e) => setNewPassword(e.target.value)}
                                                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:bg-white/[0.05] focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-white/10 pr-12"
                                                                placeholder="••••••••"
                                                                required
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowNewPassword(!showNewPassword)}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-all"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">
                                                                    {showNewPassword ? 'visibility_off' : 'visibility'}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Verify Sequence</label>
                                                        <div className="relative">
                                                            <input
                                                                type={showConfirmPassword ? "text" : "password"}
                                                                value={confirmPassword}
                                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:bg-white/[0.05] focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 outline-none transition-all placeholder:text-white/10 pr-12"
                                                                placeholder="••••••••"
                                                                required
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-all"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">
                                                                    {showConfirmPassword ? 'visibility_off' : 'visibility'}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex justify-end pt-4 border-t border-white/5">
                                                <button
                                                    disabled={loading}
                                                    className="group relative px-6 py-3 rounded-xl bg-blue-600 text-white font-black uppercase text-[10px] tracking-[0.2em] hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-20 overflow-hidden shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                                                >
                                                    <span className="relative z-10">Update Matrix</span>
                                                </button>
                                            </div>
                                        </motion.form>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>

                        {/* MIDDLE ROW: Clearance Access (Full Width) */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="glass-card rounded-2xl border border-white/10 relative overflow-hidden group"
                        >
                            <div className="absolute top-0 left-0 size-8 border-t border-l border-white/20 rounded-tl-2xl pointer-events-none" />
                            <div className="absolute bottom-0 right-0 size-8 border-b border-r border-white/20 rounded-br-2xl pointer-events-none" />
                            <div className="absolute top-0 right-0 p-3 text-[8px] font-mono text-white/10 pointer-events-none uppercase tracking-[0.2em]">
                                MOD:CLEARANCE_SYS
                            </div>
                            {/* Watermark */}
                            <div className="absolute -bottom-12 -right-12 text-[140px] text-emerald-500/[0.03] rotate-12 pointer-events-none select-none material-symbols-outlined z-0">
                                security
                            </div>

                            <div className="px-8 py-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                        <span className="material-symbols-outlined text-[18px]">security</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <h3 className="font-black uppercase tracking-widest text-xs text-white">Clearance Access</h3>
                                        <span className="text-[9px] font-mono text-white/20 uppercase">Module: AUTH_LEVEL_{user?.clearance_level || 1}</span>
                                    </div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <div className="text-[10px] font-mono text-emerald-500/40 uppercase tracking-widest">Global Rank</div>
                                    <div className="text-sm font-black text-emerald-400 uppercase tracking-wider">
                                        <span className="text-white/40 mr-2 font-mono">LVL {user?.clearance_level ?? 0} //</span>
                                        {user?.clearance_level >= 10 ? 'LEGACY' :
                                            user?.clearance_level >= 9 ? 'SENTINEL' :
                                                user?.clearance_level >= 8 ? 'OVERSEER' :
                                                    user?.clearance_level >= 7 ? 'COMMANDER' :
                                                        user?.clearance_level >= 6 ? 'VETERAN' :
                                                            user?.clearance_level >= 5 ? 'ELITE' :
                                                                user?.clearance_level >= 4 ? 'SPECIALIST' :
                                                                    user?.clearance_level >= 3 ? 'OPERATIVE' :
                                                                        user?.clearance_level >= 2 ? 'NOVICE' :
                                                                            user?.clearance_level >= 1 ? 'AGENT' : 'INITIATE'}
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 flex flex-col gap-8 flex-1 justify-between relative z-10">
                                {/* Progress Visualization */}
                                <div className="flex flex-col gap-3">
                                    <div className="flex justify-between items-end text-[10px] uppercase font-bold tracking-wider">
                                        <span className="text-white/40">Progression Status</span>
                                        <span className="text-emerald-400 font-mono">{user?.experience_points || 0} XP</span>
                                    </div>

                                    <div className="w-full h-2.5 bg-white/5 rounded-sm overflow-hidden relative border border-white/5">
                                        {(() => {
                                            const currentLevel = user?.clearance_level || 1;
                                            const currentXP = user?.experience_points || 0;
                                            const xpInCurrentLevel = currentXP % 1000;
                                            const width = (xpInCurrentLevel / 1000) * 100;

                                            return (
                                                <motion.div
                                                    key={currentLevel}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${width}%` }}
                                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                                    className="h-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)] relative overflow-hidden"
                                                >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full -translate-x-full animate-shimmer" />
                                                </motion.div>
                                            );
                                        })()}
                                    </div>

                                    <div className="flex justify-between items-center text-[9px] font-mono uppercase text-white/20">
                                        <span>Current Tier: L{user?.clearance_level || 1}</span>
                                        {(() => {
                                            const currentLevel = user?.clearance_level || 1;
                                            const currentXP = user?.experience_points || 0;
                                            const xpInCurrentLevel = currentXP % 1000;
                                            const xpRemaining = 1000 - xpInCurrentLevel;
                                            return currentLevel >= 10 ? <span>MAX LEVEL REACHED</span> : <span>Next Tier: L{currentLevel + 1} ({xpRemaining} XP REMAINING)</span>;
                                        })()}
                                    </div>
                                </div>

                                {/* Placeholder for Empty/Restricted Intel */}
                                {(!unlockedIntel.length || (!config.isIntelEnabled && !user.isAdmin && !user.permissions?.intel)) && (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-30 py-4">
                                        <span className="material-symbols-outlined text-4xl">lock_clock</span>
                                        <span className="text-[10px] font-mono uppercase tracking-widest text-center">
                                            Awaiting<br />Clearance
                                        </span>
                                    </div>
                                )}

                                {/* Carousel */}
                                {unlockedIntel.length > 0 && (config.isIntelEnabled || user.isAdmin || user.permissions?.intel) && (
                                    <div className="flex flex-col gap-4 pt-6 border-t border-white/5">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[14px] text-emerald-500/60">lock_open</span>
                                                <h4 className="text-[10px] font-black uppercase tracking-wider text-white/60">Unlocked Assets</h4>
                                            </div>
                                            <span className="text-[9px] font-mono text-emerald-500/40 uppercase">{unlockedIntel.length} AVAILABLE</span>
                                        </div>

                                        <div className="relative flex items-center gap-4">
                                            <button
                                                onClick={() => carouselRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                                                className="size-8 rounded-lg bg-white/5 border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all flex items-center justify-center group shrink-0"
                                            >
                                                <span className="material-symbols-outlined text-white/50 group-hover:text-emerald-400 text-lg">chevron_left</span>
                                            </button>

                                            <div
                                                ref={carouselRef}
                                                className="flex gap-4 overflow-x-auto pb-4 scroll-smooth flex-1 scrollbar-hide"
                                                style={{ scrollbarWidth: 'none' }}
                                            >
                                                {unlockedIntel.map((intel) => (
                                                    <motion.div
                                                        key={intel.id}
                                                        whileHover={{ scale: 1.05 }}
                                                        onClick={() => {
                                                            setViewingIntel(intel);
                                                            if (!openedAssets.has(intel.id)) {
                                                                const newOpened = new Set(openedAssets);
                                                                newOpened.add(intel.id);
                                                                setOpenedAssets(newOpened);
                                                                localStorage.setItem('intel_assets_opened', JSON.stringify(Array.from(newOpened)));
                                                            }
                                                        }}
                                                        className="group relative w-32 aspect-square bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden hover:border-emerald-500/40 transition-all cursor-pointer shrink-0 shadow-lg"
                                                    >
                                                        <img src={intel.image_url} alt={intel.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity" />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                                                        <div className="absolute bottom-2 left-2 right-2">
                                                            <div className="text-[8px] font-black text-white uppercase tracking-tight truncate">{intel.name}</div>
                                                        </div>
                                                        {!openedAssets.has(intel.id) && (
                                                            <div className="absolute top-2 right-2 size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                                        )}
                                                    </motion.div>
                                                ))}
                                            </div>

                                            <button
                                                onClick={() => carouselRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                                                className="size-8 rounded-lg bg-white/5 border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all flex items-center justify-center group shrink-0"
                                            >
                                                <span className="material-symbols-outlined text-white/50 group-hover:text-emerald-400 text-lg">chevron_right</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>

                    {/* BOTTOM ROW: System & Danger (Grid 6/6 or 8/4) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
                        {/* LEFT: System Overview */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="glass-card rounded-2xl border border-white/10 p-6 flex flex-col gap-6 relative h-full"
                        >
                            <div className="absolute top-0 right-0 p-3 text-[8px] font-mono text-white/10 pointer-events-none uppercase tracking-[0.2em]">SYS_INFO_L1</div>
                            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                                <span className="material-symbols-outlined text-[18px] text-purple-400">Hub</span>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/80">System Grid</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {[
                                    { icon: 'sync', title: 'Cloud Sync', desc: 'Real-time synchronization' },
                                    { icon: 'encrypted', title: 'Security Matrix', desc: 'Advanced encryption' },
                                    { icon: 'database', title: 'Data Integrity', desc: 'Distributed persistence' },
                                    { icon: 'fingerprint', title: 'Biometrics', desc: 'Identity verification' },
                                    { icon: 'router', title: 'Relay Cascade', desc: 'Network node monitoring' },
                                    { icon: 'security_update_warning', title: 'Threat Detect', desc: 'Heuristic analysis' }
                                ].map((item, i) => (
                                    <div key={i} className="flex gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                                        <span className="material-symbols-outlined text-sm text-white/30">{item.icon}</span>
                                        <div className="flex flex-col">
                                            <h4 className="text-[9px] font-black uppercase tracking-widest text-white/60">{item.title}</h4>
                                            <p className="text-[8px] font-mono text-white/20 uppercase leading-relaxed">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        {/* RIGHT: Actions & Admin */}
                        <div className="flex flex-col gap-6 h-full">
                            {user.isAdmin && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="p-6 glass-card rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] flex flex-col gap-4 flex-1 justify-between relative overflow-hidden group"
                                >
                                    {/* Watermark */}
                                    <div className="absolute -bottom-6 -right-6 text-[100px] text-emerald-500/[0.05] -rotate-12 pointer-events-none select-none material-symbols-outlined">
                                        admin_panel_settings
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col gap-1">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500/80">Command Center</h4>
                                            <p className="text-[9px] font-mono text-white/20 uppercase">Admin Privileges Active</p>
                                        </div>
                                        <span className="material-symbols-outlined text-emerald-500/40 text-[20px]">admin_panel_settings</span>
                                    </div>

                                    {/* Status Placeholder */}
                                    <div className="flex-1 flex items-center justify-center opacity-20 hover:opacity-40 transition-opacity">
                                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-500">System Nominal</span>
                                    </div>
                                    <button
                                        onClick={() => navigate('/admin')}
                                        className="w-full px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-black transition-all font-black uppercase text-[10px] tracking-[0.2em]"
                                    >
                                        Access Terminal
                                    </button>
                                </motion.div>
                            )}

                            <div className="p-6 glass-card rounded-2xl border border-red-500/10 bg-red-500/[0.01] flex flex-col gap-4 flex-1 justify-between relative overflow-hidden group">
                                {/* Watermark */}
                                <div className="absolute -bottom-6 -right-6 text-[100px] text-red-500/[0.05] -rotate-12 pointer-events-none select-none material-symbols-outlined">
                                    warning
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-1">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500/80">Danger Zone</h4>
                                        <p className="text-[9px] font-mono text-white/20 uppercase">Session termination</p>
                                    </div>
                                    <span className="material-symbols-outlined text-red-500/40 text-[20px]">warning</span>
                                </div>

                                {/* Status Placeholder */}
                                <div className="flex-1 flex items-center justify-center opacity-20 hover:opacity-40 transition-opacity">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="size-1.5 rounded-full bg-red-500 animate-[pulse_2s_infinite]" />
                                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-500">Monitoring Active</span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="w-full px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 transition-all font-black uppercase text-[10px] tracking-[0.2em]"
                                >
                                    Terminate Session
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Fullscreen Image Only Viewer */}
            <AnimatePresence>
                {fullscreenImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setFullscreenImage(null)}
                        className="fixed inset-0 z-[10000] bg-black flex items-center justify-center p-4 cursor-pointer"
                    >
                        <motion.img
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            src={fullscreenImage}
                            alt="Fullscreen"
                            onClick={(e) => e.stopPropagation()}
                            className="max-w-full max-h-full object-contain"
                        />
                        <button
                            onClick={() => setFullscreenImage(null)}
                            className="absolute top-4 right-4 size-10 rounded-full bg-black/80 border border-white/20 hover:border-white/40 hover:bg-white/10 transition-all flex items-center justify-center"
                        >
                            <span className="material-symbols-outlined text-white text-xl">close</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Fullscreen Intel Viewer */}
            <AnimatePresence>
                {viewingIntel && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setViewingIntel(null)}
                        className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 cursor-pointer"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative w-full h-full flex flex-col bg-black/95 rounded-lg overflow-hidden border border-white/10"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 bg-black/80 border-b border-white/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <h3 className="text-sm font-black uppercase tracking-wider text-white">
                                        {viewingIntel.name}
                                    </h3>
                                    {viewingIntel.unlock_code && (
                                        <span className="text-[9px] font-mono text-emerald-500/60 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                                            {viewingIntel.unlock_code}
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setViewingIntel(null)}
                                    className="text-white/40 hover:text-white transition-colors p-2 hover:bg-white/5 rounded"
                                >
                                    <span className="material-symbols-outlined text-xl">close</span>
                                </button>
                            </div>

                            {/* Content: Image Fullscreen Left, Description Right */}
                            <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
                                {/* Image Container - Left (Fullscreen) */}
                                <div
                                    className="flex-[2] relative bg-black/80 rounded-lg overflow-hidden flex items-center justify-center border border-white/5 min-w-0 cursor-zoom-in group/image"
                                    onClick={() => setFullscreenImage(viewingIntel.image_url)}
                                >
                                    <img
                                        src={viewingIntel.image_url}
                                        alt={viewingIntel.name}
                                        className="w-full h-full object-contain group-hover/image:opacity-90 transition-opacity"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors flex items-center justify-center">
                                        <span className="material-symbols-outlined text-white/0 group-hover/image:text-white/40 text-4xl transition-all">fullscreen</span>
                                    </div>
                                </div>

                                {/* Description Container - Right */}
                                <div className="flex-1 shrink-0 flex flex-col gap-4 bg-black/60 rounded-lg p-5 border border-white/5 min-w-[320px] max-w-[400px]">
                                    <div className="flex items-center gap-2 pb-3 border-b border-white/5 shrink-0">
                                        <span className="material-symbols-outlined text-emerald-500/60 text-sm">info</span>
                                        <h4 className="text-xs font-black uppercase tracking-wider text-white/80">Asset Details</h4>
                                    </div>
                                    {viewingIntel.description ? (
                                        <div className="flex-1 min-h-0">
                                            <p className="text-sm font-mono text-white/70 leading-relaxed break-words whitespace-normal hyphens-auto">
                                                {viewingIntel.description}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center">
                                            <p className="text-xs font-mono text-white/30 italic">No description available</p>
                                        </div>
                                    )}
                                    {viewingIntel.unlock_code && (
                                        <div className="pt-3 border-t border-white/5 shrink-0">
                                            <div className="text-[9px] font-mono text-white/40 uppercase tracking-wider mb-2">Unlock Code</div>
                                            <div className="text-sm font-mono text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded border border-emerald-500/20 break-all">
                                                {viewingIntel.unlock_code}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-3 bg-black/80 border-t border-white/10 text-center shrink-0">
                                <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">
                                    Click outside to close
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div >
    );
};

export default Account;
