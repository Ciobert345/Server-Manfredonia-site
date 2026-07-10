import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import { useModal } from '../contexts/ModalContext';
import { supabase } from '../services/supabase';
import { motion, AnimatePresence } from 'framer-motion';

const DEBUG_ADMIN = false;
const debugLog = (...args: any[]) => {
    if (DEBUG_ADMIN) console.log('[Admin]', ...args);
};

interface Profile {
    id: string;
    username: string;
    email?: string;
    read_banner_ids?: string[];
    is_approved: boolean;
    is_admin: boolean;
    clearance_level: number;
    experience_points: number;
    permissions: {
        terminal?: boolean;
        intel?: boolean;
        dashboard?: boolean;
    };
    avatar_url: string | null;
    mcss_config_id: string | null;
}

interface IntelAsset {
    id: string;
    name: string;
    description: string;
    image_url: string;
    unlock_code: string;
    required_clearance: number;
}

interface AdminNotification {
    id: string;
    enabled: boolean;
    title: string;
    subtitle: string;
    message: string;
    icon: string;
    style: string;
}

interface AdminRoadmapItem {
    id: string;
    title: string;
    description: string;
    type: string;
    priority: string;
    column: string;
    progress: number;
    comments: number;
}

const Admin: React.FC = () => {
    const { user, loading: authLoading } = useAuth();
    const { setModalOpen } = useModal();
    const navigate = useNavigate();

    // Tabs: 'system' | 'users' | 'intel' | 'comms' | 'roadmap' | 'settings' | 'blog'
    const [activeTab, setActiveTab] = useState<'system' | 'users' | 'intel' | 'comms' | 'roadmap' | 'settings' | 'blog'>('system');

    // Data States
    const { config, isDashboardGloballyEnabled, updateDashboardStatus, updateGlobalConfig, updateMcssMasterKey } = useConfig();
    const [users, setUsers] = useState<Profile[]>([]);
    const [intel, setIntel] = useState<IntelAsset[]>([]);
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);
    const [roadmapItems, setRoadmapItems] = useState<AdminRoadmapItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    // Form States
    const [editingIntel, setEditingIntel] = useState<Partial<IntelAsset> | null>(null);
    const [isIntelModalOpen, setIntelModalOpen] = useState(false);

    const [editingNotification, setEditingNotification] = useState<Partial<AdminNotification> | null>(null);
    const [isNotificationModalOpen, setNotificationModalOpen] = useState(false);

    const [editingRoadmap, setEditingRoadmap] = useState<Partial<AdminRoadmapItem> | null>(null);
    const [roadmapModalOpen, setRoadmapModalOpen] = useState(false);
    const [draggedItem, setDraggedItem] = useState<any | null>(null);

    // Blog States
    const [blogPosts, setBlogPosts] = useState<any[]>([]);
    const [editingBlogPost, setEditingBlogPost] = useState<any | null>(null);
    const [blogModalOpen, setBlogModalOpen] = useState(false);
    const [blogTagInput, setBlogTagInput] = useState('');
    const [blogPreviewMode, setBlogPreviewMode] = useState(false);

    // Security Gate
    useEffect(() => {
        if (!authLoading) {
            if (!user || !user.isAdmin) {
                navigate('/');
            }
        }
    }, [user, authLoading, navigate]);

    // Initial Fetch
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Users
                const { data: userData, error: userError } = await supabase
                    .from('profiles')
                    .select('*, permissions')
                    .order('created_at', { ascending: false });

                if (userError) throw userError;
                setUsers(userData || []);

                // Fetch Intel
                const { data: intelData, error: intelError } = await supabase
                    .from('intel_assets')
                    .select('*')
                    .order('required_clearance');

                if (intelError) throw intelError;
                setIntel(intelData || []);

                // Fetch Notifications
                const { data: noteData, error: noteError } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
                if (noteError) throw noteError;
                setNotifications(noteData || []);

                // Fetch Roadmap
                const { data: roadData, error: roadError } = await supabase.from('roadmap_items').select('*').order('created_at', { ascending: true });
                if (roadError) throw roadError;
                setRoadmapItems(roadData || []);

                // Fetch Blog Posts
                const { data: blogData, error: blogError } = await supabase
                    .from('blog_posts')
                    .select('*, author:profiles!author_id(username)')
                    .order('created_at', { ascending: false });
                if (blogError) throw blogError;
                setBlogPosts((blogData || []).map((p: any) => ({ ...p, author_username: p.author?.username || 'Admin' })));

            } catch (err: any) {
                console.error('Admin fetch error:', err);
                showStatus('error', 'Inizializzazione fallita: ' + err.message);
            } finally {
                setLoading(false);
            }
        };

        if (user?.isAdmin) fetchData();
    }, [user]);

    const showStatus = (type: 'success' | 'error', msg: string) => {
        setStatus({ type, msg });
        setTimeout(() => setStatus(null), 3000);
    };

    // SYSTEM HANDLERS
    const toggleDashboardAccess = async () => {
        try {
            await updateDashboardStatus(!isDashboardGloballyEnabled);
            showStatus('success', `Dashboard ${!isDashboardGloballyEnabled ? 'ATTIVATA' : 'DISATTIVATA'}`);
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    // USER HANDLERS
    const updateUserStatus = async (userId: string, updates: Partial<Profile>) => {
        try {
            debugLog(`Updating user ${userId} with:`, updates);
            // 1. Update Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();

            if (profileError) throw profileError;

            // 2. Automate MCSS config assignment if is_admin or is_approved was changed
            if (updates.is_admin !== undefined || updates.is_approved !== undefined) {
                const refreshedUser = { ...profileData, ...updates }; // Ensure we have latest values
                let targetConfigId = null;

                if (refreshedUser.is_approved) {
                    targetConfigId = refreshedUser.is_admin ? 'admin' : 'standard';
                }

                if (targetConfigId !== undefined) {
                    debugLog(`[Admin] Assigning MCSS Config ID for ${userId}: ${targetConfigId}`);
                    const { error: mcssError } = await supabase
                        .from('profiles')
                        .update({ mcss_config_id: targetConfigId })
                        .eq('id', userId);

                    if (mcssError) console.error('[Admin] MCSS Assignment Failed:', mcssError);
                }
            }

            setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
            showStatus('success', 'Profilo aggiornato con successo');
        } catch (err: any) {
            console.error('[Admin] Exception:', err);
            showStatus('error', err.message);
            alert(`Errore Database: ${err.message}`);
        }
    };

    const deleteUser = async (userId: string) => {
        if (!confirm('Eliminare permanentemente questo utente? Questa azione rimuoverà il profilo.')) return;

        try {
            debugLog(`[Admin] Attempting deletion of user profile: ${userId}`);

            // 1. Remove Profile first (important for FK)
            const { error: profileError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId);

            if (profileError) {
                console.error('[Admin] Profile Deletion Error:', profileError);
                throw new Error(`Profile: ${profileError.message}`);
            }

            // 2. Remove MCSS Config ONLY if it's a private one (not 'admin' or 'standard')
            // This assumes private configs use the userId as the row ID
            if (userId !== 'admin' && userId !== 'standard') {
                const { error: mcssError } = await supabase
                    .from('mcss_configs')
                    .delete()
                    .eq('id', userId);

                if (mcssError) console.warn('[Admin] MCSS Cleanup Failed (Minor):', mcssError);
            }

            setUsers(prev => prev.filter(u => u.id !== userId));
            showStatus('success', 'Operativo rimosso permanentemente');
        } catch (err: any) {
            console.error('[Admin] Delete exception:', err);
            showStatus('error', 'Eliminazione fallita');
            alert(`Errore critico durante l'eliminazione:\n${err.message}\n\nVerifica i permessi RLS nel database.`);
        }
    };

    // INTEL HANDLERS
    const saveIntel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingIntel) return;

        try {
            // Pick only allowed fields to avoid sending read-only or invalid columns
            const payload = {
                name: editingIntel.name,
                description: editingIntel.description,
                image_url: editingIntel.image_url,
                unlock_code: editingIntel.unlock_code,
                required_clearance: editingIntel.required_clearance
            };

            if (editingIntel.id) {
                // Update
                const { error } = await supabase
                    .from('intel_assets')
                    .update(payload)
                    .eq('id', editingIntel.id);

                if (error) throw error;

                setIntel(prev => prev.map(i => i.id === editingIntel.id ? { ...i, ...payload } as IntelAsset : i));
                showStatus('success', 'Asset Intel aggiornato');
            } else {
                // Insert
                const { data, error } = await supabase
                    .from('intel_assets')
                    .insert([payload])
                    .select();

                if (error) throw error;
                if (data) setIntel(prev => [...prev, data[0]]);
                showStatus('success', 'Nuovo asset Intel creato');
            }
            setIntelModalOpen(false);
            setModalOpen(false);
            setEditingIntel(null);
        } catch (err: any) {
            console.error('Intel Save Error Detail:', err);
            // Show more detailed error if available (hint or code)
            const detail = err.hint || err.details || '';
            showStatus('error', `${err.message}${detail ? ` (${detail})` : ''}`);
        }
    };

    const deleteIntel = async (id: string) => {
        if (!confirm('Eliminare permanentemente questo asset?')) return;
        try {
            const { error } = await supabase
                .from('intel_assets')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setIntel(prev => prev.filter(i => i.id !== id));
            showStatus('success', 'Asset eliminato');
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    // NOTIFICATION HANDLERS
    const saveNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingNotification) return;

        try {
            const payload = {
                enabled: editingNotification.enabled ?? true,
                title: editingNotification.title,
                subtitle: editingNotification.subtitle,
                message: editingNotification.message,
                icon: editingNotification.icon || 'notification',
                style: editingNotification.style || 'banner-blue'
            };

            if (editingNotification.id) {
                const { error } = await supabase.from('notifications').update(payload).eq('id', editingNotification.id);
                if (error) throw error;
                setNotifications(prev => prev.map(n => n.id === editingNotification.id ? { ...n, ...payload } as AdminNotification : n));
                showStatus('success', 'Notifica aggiornata');
            } else {
                const id = 'banner_' + Date.now();
                const { data, error } = await supabase.from('notifications').insert([{ id, ...payload }]).select();
                if (error) throw error;
                if (data) setNotifications(prev => [data[0], ...prev]);
                showStatus('success', 'Nuova notifica creata');
            }
            setNotificationModalOpen(false);
            setModalOpen(false);
            setEditingNotification(null);
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    const deleteNotification = async (id: string) => {
        if (!confirm('Eliminare questa notifica e rimuoverla da tutti i profili utenti?')) return;
        try {
            // 1. Cleanup: Remove this ID from junction table for all users
            debugLog(`Cleaning up banner ${id} from all user profiles in junction table...`);
            const { error: cleanupError } = await supabase
                .from('profile_read_banners')
                .delete()
                .eq('banner_id', id);

            if (cleanupError) {
                console.error(`Failed to cleanup banner ${id}:`, cleanupError);
            } else {
                // Update local state for all users who had this banner read
                setUsers(prev => prev.map(u => ({
                    ...u,
                    read_banner_ids: (u.read_banner_ids || []).filter(bid => bid !== id)
                })));
            }

            // 2. Delete the actual notification
            const { error } = await supabase.from('notifications').delete().eq('id', id);

            if (error) throw error;

            setNotifications(prev => prev.filter(n => n.id !== id));
            showStatus('success', 'Notifica eliminata e cleanup completato');
        } catch (err: any) {
            console.error('Delete notification error:', err);
            showStatus('error', 'Errore durante eliminazione: ' + err.message);
        }
    };

    // ROADMAP HANDLERS
    const saveRoadmapItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRoadmap) return;

        try {
            const payload = {
                title: editingRoadmap.title,
                description: editingRoadmap.description,
                type: editingRoadmap.type || 'nextup',
                priority: editingRoadmap.priority || 'Medium',
                column: editingRoadmap.column || 'backlog',
                progress: editingRoadmap.progress || 0,
                comments: editingRoadmap.comments || 0
            };

            if (editingRoadmap.id) {
                const { error } = await supabase.from('roadmap_items').update(payload).eq('id', editingRoadmap.id);
                if (error) throw error;
                setRoadmapItems(prev => prev.map(r => r.id === editingRoadmap.id ? { ...r, ...payload } as AdminRoadmapItem : r));
                showStatus('success', 'Roadmap aggiornata');
            } else {
                const id = 'road_' + Date.now();
                const { data, error } = await supabase.from('roadmap_items').insert([{ id, ...payload }]).select();
                if (error) throw error;
                if (data) setRoadmapItems(prev => [...prev, data[0]]);
                showStatus('success', 'Nuovo task aggiunto');
            }
            setRoadmapModalOpen(false);
            setModalOpen(false);
            setEditingRoadmap(null);
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    const deleteRoadmapItem = async (id: string) => {
        if (!confirm('Eliminare questo task dalla roadmap?')) return;
        try {
            const { error } = await supabase.from('roadmap_items').delete().eq('id', id);
            if (error) throw error;
            setRoadmapItems(prev => prev.filter(r => r.id !== id));
            showStatus('success', 'Task eliminato');
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    // BLOG HANDLERS
    const saveBlogPost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBlogPost) return;

        try {
            const payload = {
                author_id: editingBlogPost.author_id || user?.id,
                title: editingBlogPost.title,
                slug: editingBlogPost.slug || editingBlogPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
                excerpt: editingBlogPost.excerpt || '',
                content: editingBlogPost.content || '',
                cover_image_url: editingBlogPost.cover_image_url || '',
                status: editingBlogPost.status || 'draft',
                is_featured: editingBlogPost.is_featured ?? false,
                required_clearance_level: editingBlogPost.required_clearance_level ?? 0,
                tags: editingBlogPost.tags || [],
                published_at: editingBlogPost.status === 'published' ? (editingBlogPost.published_at || new Date().toISOString()) : null
            };

            if (editingBlogPost.id) {
                const { error } = await supabase.from('blog_posts').update(payload).eq('id', editingBlogPost.id);
                if (error) throw error;
                setBlogPosts(prev => prev.map(p => p.id === editingBlogPost.id ? { ...p, ...payload } : p));
                showStatus('success', 'Articolo del blog aggiornato');
            } else {
                const { data, error } = await supabase.from('blog_posts').insert([payload]).select();
                if (error) throw error;
                if (data) {
                    const fullNewPost = { ...data[0], author_username: user?.username || 'Admin' };
                    setBlogPosts(prev => [fullNewPost, ...prev]);
                }
                showStatus('success', 'Nuovo articolo del blog creato');
            }
            setBlogModalOpen(false);
            setModalOpen(false);
            setEditingBlogPost(null);
            setBlogPreviewMode(false);
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    const deleteBlogPost = async (id: string) => {
        if (!confirm('Eliminare permanentemente questo articolo dal blog?')) return;
        try {
            const { error } = await supabase.from('blog_posts').delete().eq('id', id);
            if (error) throw error;
            setBlogPosts(prev => prev.filter(p => p.id !== id));
            showStatus('success', 'Articolo eliminato');
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    const duplicateBlogPost = async (post: any) => {
        try {
            const payload = {
                author_id: user?.id,
                title: `${post.title} (Copia)`,
                slug: `${post.slug}-copy-${Date.now()}`,
                excerpt: post.excerpt || '',
                content: post.content || '',
                cover_image_url: post.cover_image_url || '',
                status: 'draft',
                is_featured: false,
                required_clearance_level: post.required_clearance_level ?? 0,
                tags: post.tags || []
            };

            const { data, error } = await supabase.from('blog_posts').insert([payload]).select();
            if (error) throw error;
            if (data) {
                const fullNewPost = { ...data[0], author_username: user?.username || 'Admin' };
                setBlogPosts(prev => [fullNewPost, ...prev]);
            }
            showStatus('success', 'Articolo duplicato come bozza');
        } catch (err: any) {
            showStatus('error', err.message);
        }
    };

    if (authLoading || !user?.isAdmin) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="size-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                    <span className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.4em]">Establishing Secure Link...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white pt-20 pb-12 px-4 md:px-8 -mt-20">
            {/* BACKGROUND DECOR */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-grid-white/[0.015] bg-[size:40px_40px]" />
            </div>

            <div className="max-w-7xl mx-auto relative z-10 mt-24">
                {/* HEADER */}
                <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                                <span className="material-symbols-outlined text-2xl">admin_panel_settings</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter">Command <span className="text-white/20">Center</span></h1>
                        </div>
                        <p className="text-xs font-mono text-white/40 uppercase tracking-[0.3em] pl-1.5">Administrative Override Terminal /// SECURE_SESSION_v4</p>
                    </div>

                    {/* STATUS TOAST */}
                    <AnimatePresence>
                        {status && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className={`px-6 py-3 rounded-xl border flex items-center gap-3 backdrop-blur-md shadow-2xl ${status.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm">{status.type === 'error' ? 'warning' : 'check_circle'}</span>
                                <span className="text-[10px] font-black uppercase tracking-widest">{status.msg}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </header>

                {/* LAYOUT CONTAINER */}
                <div className="flex flex-col lg:flex-row gap-8 items-start">

                    {/* SIDEBAR SELECTOR - VERTICAL PREMIUM DESIGN */}
                    <aside className="w-full lg:w-72 lg:sticky lg:top-24 shrink-0 transition-all duration-500">
                        <div className="flex flex-col p-2 bg-white/[0.02] border border-white/5 rounded-[32px] backdrop-blur-xl relative overflow-hidden group">
                            {/* Decorative blur inside sidebar */}
                            <div className="absolute -top-24 -right-24 size-48 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none group-hover:bg-emerald-500/20 transition-colors duration-700" />

                            <div className="relative z-10 flex flex-col gap-1.5">
                                {[
                                    { id: 'system', label: 'System', icon: 'settings', desc: 'Core infrastructure' },
                                    { id: 'users', label: 'Personnel', icon: 'group', desc: 'Identity & Access' },
                                    { id: 'intel', label: 'Intel', icon: 'topic', desc: 'Tactical assets' },
                                    { id: 'comms', label: 'Comms', icon: 'campaign', desc: 'Uplink signals' },
                                    { id: 'roadmap', label: 'Roadmap', icon: 'reorder', desc: 'Project trajectory' },
                                    { id: 'blog', label: 'Blog', icon: 'article', desc: 'Content publishing' },
                                    { id: 'settings', label: 'Settings', icon: 'tune', desc: 'Module config' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`group/btn relative w-full flex items-center gap-4 py-4 px-5 rounded-[24px] transition-all duration-500 overflow-hidden ${activeTab === tab.id
                                            ? 'text-black'
                                            : 'text-white/40 hover:text-white hover:bg-white/[0.03]'
                                            }`}
                                    >
                                        {activeTab === tab.id && (
                                            <motion.div
                                                layoutId="activeTabPill"
                                                className="absolute inset-0 bg-white shadow-[0_8px_30px_rgba(255,255,255,0.2)]"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}

                                        <div className="relative z-10 flex items-center justify-center size-10 rounded-xl transition-all duration-500">
                                            <motion.span
                                                animate={{
                                                    scale: activeTab === tab.id ? 1.1 : 1,
                                                    rotate: activeTab === tab.id ? [0, -10, 10, 0] : 0
                                                }}
                                                transition={{ duration: 0.4 }}
                                                className="material-symbols-outlined text-2xl"
                                            >
                                                {tab.icon}
                                            </motion.span>
                                        </div>

                                        <div className="relative z-10 flex flex-col items-start gap-0.5">
                                            <span className="text-[11px] font-black uppercase tracking-[0.15em] leading-none">{tab.label}</span>
                                            <span className={`text-[8px] font-mono uppercase tracking-widest opacity-40 group-hover/btn:opacity-60 transition-opacity ${activeTab === tab.id ? 'text-black/60' : 'text-white/40'}`}>
                                                {tab.desc}
                                            </span>
                                        </div>

                                        {/* Hover glow effect for non-active tabs */}
                                        {activeTab !== tab.id && (
                                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Additional Sidebar Info */}
                        <div className="mt-8 px-6 hidden lg:block">
                            <div className="flex flex-col gap-4">
                                <div className="h-px w-12 bg-white/10" />
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-[0.4em]">System_Uptime</span>
                                    <span className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest">1,244:59:12</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-[0.4em]">Auth_Token</span>
                                    <span className="text-[9px] font-mono text-white/10 truncate">SEC_SESSION_0x884...</span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* CONTENT AREA */}
                    <div className="flex-1 w-full min-h-[600px] lg:pt-0">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-32 gap-4">
                                <div className="size-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
                                <span className="text-[9px] font-mono text-white/20 uppercase tracking-widest">Polling Database...</span>
                            </div>
                        ) : (
                            <AnimatePresence mode="wait">
                                {/* SYSTEM TAB - MISSION CONTROL */}
                                {activeTab === 'system' && (
                                    <motion.div
                                        key="system"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-8"
                                    >
                                        {/* Command Center Header Status */}
                                        <div className="flex items-center justify-between px-6 py-4 bg-white/[0.03] border border-white/5 rounded-3xl backdrop-blur-md">
                                            <div className="flex items-center gap-6">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-[0.4em]">Core_System</span>
                                                    <span className="text-sm font-black text-white uppercase italic tracking-tighter">Command_Center_V4</span>
                                                </div>
                                                <div className="h-8 w-px bg-white/5"></div>
                                                <div className="flex items-center gap-2">
                                                    <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                    <span className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest leading-none">Operational</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8 text-[9px] font-mono text-white/20">
                                                <span className="hidden sm:inline">RELAY_SYNC: 99.8%</span>
                                                <span className="hidden sm:inline">LOAD: 0.22ms</span>
                                                <span className="text-white/40">{new Date().toLocaleTimeString()}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* MODULE 1: PERSONNEL & UPLINK */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-all duration-700">
                                                    <span className="material-symbols-outlined text-[140px] -rotate-12 font-thin">hub</span>
                                                </div>

                                                <div className="flex items-start justify-between relative z-10">
                                                    <div className="flex flex-col gap-1">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter">Main_Dashboard</h3>
                                                        <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Global Personnel Access</p>
                                                    </div>
                                                    <button
                                                        onClick={toggleDashboardAccess}
                                                        className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all duration-500 flex items-center gap-2 ${isDashboardGloballyEnabled
                                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-red-500 hover:text-white hover:border-red-500/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                                                            : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-emerald-500 hover:text-white hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{isDashboardGloballyEnabled ? 'power_settings_new' : 'bolt'}</span>
                                                        {isDashboardGloballyEnabled ? 'Active' : 'Offline'}
                                                    </button>
                                                </div>

                                                {/* ANALYTICS: Personnel Flow SVG */}
                                                <div className="flex-1 flex flex-col gap-6 relative z-10 min-h-[160px] justify-center">
                                                    <div className="flex items-center justify-between gap-12">
                                                        <div className="relative size-32 shrink-0">
                                                            <svg className="w-full h-full -rotate-90 overflow-visible" viewBox="0 0 100 100">
                                                                <circle cx="50" cy="50" r="42" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                                                                <circle
                                                                    cx="50" cy="50" r="42" fill="transparent" stroke="currentColor" strokeWidth="8"
                                                                    className="text-emerald-500 transition-all duration-1000 ease-out"
                                                                    strokeDasharray={`${(users.filter(u => u.is_approved).length / (users.length || 1)) * 264} 264`}
                                                                    strokeLinecap="round"
                                                                    style={{ filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.4))' }}
                                                                />
                                                            </svg>
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                <span className="text-2xl font-black text-white italic tracking-tighter">{Math.round((users.filter(u => u.is_approved).length / (users.length || 1)) * 100)}%</span>
                                                                <span className="text-[8px] text-white/30 font-mono uppercase">Verified</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 space-y-5">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex justify-between items-baseline">
                                                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Citizens</span>
                                                                    <span className="text-xl font-black text-white italic tracking-tighter">{users.filter(u => u.is_approved).length}</span>
                                                                </div>
                                                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500" style={{ width: `${(users.filter(u => u.is_approved).length / (users.length || 1)) * 100}%` }}></div>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex justify-between items-baseline">
                                                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Pending</span>
                                                                    <span className="text-xl font-black text-white/40 italic tracking-tighter">{users.filter(u => !u.is_approved).length}</span>
                                                                </div>
                                                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-white/10" style={{ width: `${(users.filter(u => !u.is_approved).length / (users.length || 1)) * 100}%` }}></div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* MODULE 2: INTERFACE & CLEARANCE */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-all duration-700">
                                                    <span className="material-symbols-outlined text-[140px] -rotate-12 font-thin">terminal</span>
                                                </div>

                                                <div className="flex items-start justify-between relative z-10">
                                                    <div className="flex flex-col gap-1">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter">Terminal_V4</h3>
                                                        <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Command Interface Protocol</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateGlobalConfig({ is_terminal_enabled: !config?.isTerminalEnabled })}
                                                        className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all duration-500 flex items-center gap-2 ${config?.isTerminalEnabled
                                                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-white hover:text-black hover:border-white'
                                                            : 'bg-white/5 border-white/10 text-white/20 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]'
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{config?.isTerminalEnabled ? 'terminal' : 'block'}</span>
                                                        {config?.isTerminalEnabled ? 'Enabled' : 'Disabled'}
                                                    </button>
                                                </div>

                                                {/* ANALYTICS: Tactical Rank Waveform SVG */}
                                                <div className="flex-1 flex flex-col gap-6 relative z-10 min-h-[160px] justify-center">
                                                    <div className="flex flex-col gap-3 relative z-10 w-full">
                                                        {(() => {
                                                            const levels = [
                                                                { range: [1, 3], label: 'INITIATE', color: 'bg-blue-500/20' },
                                                                { range: [4, 6], label: 'OPERATIVE', color: 'bg-blue-500/30' },
                                                                { range: [7, 8], label: 'ELITE', color: 'bg-blue-500/40' },
                                                                { range: [9, 10], label: 'LEGACY', color: 'bg-blue-500/50' }
                                                            ];

                                                            return levels.map((grp) => {
                                                                const count = users.filter(u => u.clearance_level >= grp.range[0] && u.clearance_level <= grp.range[1]).length;
                                                                const percentage = (count / (users.length || 1)) * 100;

                                                                return (
                                                                    <div key={grp.label} className="group/row flex flex-col gap-1.5">
                                                                        <div className="flex justify-between items-center px-1">
                                                                            <span className="text-[10px] font-black tracking-[0.2em] text-white/40 group-hover/row:text-blue-400 transition-colors">{grp.label}</span>
                                                                            <span className="text-[10px] font-mono text-white/20">{count.toString().padStart(2, '0')}_UNITS</span>
                                                                        </div>
                                                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                                                                            <div
                                                                                className={`h-full ${grp.color} transition-all duration-1000 shadow-[0_0_15px_rgba(59,130,246,0.3)]`}
                                                                                style={{ width: `${Math.max(2, percentage)}%` }}
                                                                            ></div>
                                                                            {/* Scanning effect per bar */}
                                                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent w-1/4 animate-scan pointer-events-none"></div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            });
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* MODULE 3: INTELLIGENCE & LORE */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-all duration-700">
                                                    <span className="material-symbols-outlined text-[140px] -rotate-12 font-thin">topic</span>
                                                </div>

                                                <div className="flex items-start justify-between relative z-10">
                                                    <div className="flex flex-col gap-1">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter">Intel_Protocol</h3>
                                                        <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Tactical Asset Management</p>
                                                    </div>
                                                    <button
                                                        onClick={() => updateGlobalConfig({ is_intel_enabled: !config?.isIntelEnabled })}
                                                        className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all duration-500 flex items-center gap-2 ${config?.isIntelEnabled
                                                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-white hover:text-black hover:border-white'
                                                            : 'bg-white/5 border-white/10 text-white/20 hover:bg-amber-500 hover:text-white hover:border-amber-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{config?.isIntelEnabled ? 'visibility' : 'visibility_off'}</span>
                                                        {config?.isIntelEnabled ? 'Active' : 'Offline'}
                                                    </button>
                                                </div>

                                                {/* ANALYTICS: Database Saturation SVG */}
                                                <div className="flex-1 flex flex-col gap-6 relative z-10 min-h-[160px] justify-center">
                                                    <div className="grid grid-cols-2 gap-8 items-center">
                                                        <div className="space-y-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Assets_Live</span>
                                                                <div className="flex items-baseline gap-2">
                                                                    <span className="text-4xl font-black text-white italic tracking-tighter">{intel.length}</span>
                                                                    <span className="text-[10px] text-amber-500 font-bold">FILES</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Saturation</span>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${(intel.length / Math.max(intel.length, 20)) * 100}%` }}></div>
                                                                    </div>
                                                                    <span className="text-[10px] font-mono text-white/40">{Math.round((intel.length / Math.max(intel.length, 20)) * 100)}%</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="relative aspect-square">
                                                            <svg className="w-full h-full" viewBox="0 0 100 100">
                                                                <circle cx="50" cy="50" r="30" fill="transparent" stroke="currentColor" strokeWidth="1" className="text-amber-500/10 animate-pulse" />
                                                                <circle cx="50" cy="50" r="45" fill="transparent" stroke="currentColor" strokeWidth="1" className="text-amber-500/5" />
                                                                <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="0.5" className="text-white/10" />
                                                                <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="0.5" className="text-white/10" />
                                                                {intel.slice(0, 15).map((_, i) => {
                                                                    const angle = (i / 15) * Math.PI * 2;
                                                                    const r = 15 + (i * 2) % 30;
                                                                    return (
                                                                        <circle
                                                                            key={i}
                                                                            cx={50 + Math.cos(angle) * r}
                                                                            cy={50 + Math.sin(angle) * r}
                                                                            r="1.5"
                                                                            className="fill-amber-500 animate-pulse"
                                                                            style={{ animationDelay: `${i * 150}ms` }}
                                                                        />
                                                                    )
                                                                })}
                                                            </svg>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* MODULE 4: OPERATIONS & SECURITY */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-all duration-700">
                                                    <span className="material-symbols-outlined text-[140px] -rotate-12 font-thin">lock</span>
                                                </div>

                                                <div className="flex items-start justify-between relative z-10">
                                                    <div className="flex flex-col gap-1">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter">Order_66</h3>
                                                        <p className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Site-Wide Access Control</p>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            if (!config?.isEmergencyEnabled && !confirm("ATTENZIONE: Stai per attivare il LOCKDOWN globale. Procedere?")) return;
                                                            updateGlobalConfig({ is_emergency_enabled: !config?.isEmergencyEnabled });
                                                        }}
                                                        className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border transition-all duration-500 flex items-center gap-2 ${config?.isEmergencyEnabled
                                                            ? 'bg-red-500 text-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                                                            : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white'
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{config?.isEmergencyEnabled ? 'lock_open' : 'lock'}</span>
                                                        {config?.isEmergencyEnabled ? 'Lifting...' : 'Lockdown'}
                                                    </button>
                                                </div>

                                                {/* ANALYTICS: Project Velocity SVG */}
                                                <div className="flex-1 flex flex-col gap-6 relative z-10 min-h-[160px] justify-center">
                                                    <div className="flex flex-col gap-5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Roadmap Status</span>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="size-1.5 rounded-full bg-emerald-500"></div>
                                                                    <span className="text-[8px] font-mono text-white/30">{roadmapItems.filter(r => r.column === 'done').length}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="size-1.5 rounded-full bg-blue-500"></div>
                                                                    <span className="text-[8px] font-mono text-white/30">{roadmapItems.filter(r => r.column === 'inprogress').length}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="size-1.5 rounded-full bg-purple-500"></div>
                                                                    <span className="text-[8px] font-mono text-white/30">{roadmapItems.filter(r => r.column === 'nextup').length}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="w-full space-y-3">
                                                            <div className="h-8 w-full bg-white/5 rounded-2xl overflow-hidden flex p-1 gap-1">
                                                                <div
                                                                    className="h-full bg-emerald-500 rounded-xl transition-all duration-1000 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"
                                                                    style={{ width: `${(roadmapItems.filter(r => r.column === 'done').length / (roadmapItems.length || 1)) * 100}%` }}
                                                                />
                                                                <div
                                                                    className="h-full bg-blue-500 rounded-xl transition-all duration-1000 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"
                                                                    style={{ width: `${(roadmapItems.filter(r => r.column === 'inprogress').length / (roadmapItems.length || 1)) * 100}%` }}
                                                                />
                                                                <div
                                                                    className="h-full bg-purple-500 rounded-xl transition-all duration-1000 shadow-[inset_0_0_10px_rgba(0,0,0,0.3)]"
                                                                    style={{ width: `${(roadmapItems.filter(r => r.column === 'nextup').length / (roadmapItems.length || 1)) * 100}%` }}
                                                                />
                                                                <div
                                                                    className="h-full bg-white/10 rounded-xl transition-all duration-1000"
                                                                    style={{ width: `${(roadmapItems.filter(r => r.column === 'backlog').length / (roadmapItems.length || 1)) * 100}%` }}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between text-[9px] font-mono text-white/20 uppercase tracking-[0.1em] pt-1 px-1">
                                                                <span>Deployment</span>
                                                                <span>WIP</span>
                                                                <span>NextUp</span>
                                                                <span>Backlog</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* PERSONNEL TAB */}
                                {activeTab === 'users' && (
                                    <motion.div
                                        key="users"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-4"
                                    >
                                        <div className="flex items-center justify-between px-2 mb-2">
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{users.length} Registered Operatives</span>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2 rounded-full bg-emerald-500" />
                                                    <span className="text-[9px] font-black uppercase text-white/30">Approved</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2 rounded-full bg-purple-500" />
                                                    <span className="text-[9px] font-black uppercase text-white/30">Admin</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            {/* HEADER LEGEND */}
                                            <div className="hidden md:grid grid-cols-12 px-6 pb-2 text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] select-none">
                                                <div className="col-span-4">Operative</div>
                                                <div className="col-span-4 text-center">Clearance & Role</div>
                                                <div className="col-span-4 text-right">Status & Privileges</div>
                                            </div>

                                            {users.map(u => (
                                                <div key={u.id} className="glass-card px-4 py-3 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all grid grid-cols-1 md:grid-cols-12 gap-4 items-center group relative overflow-hidden">

                                                    {/* COL 1: IDENTITY (Span 4) */}
                                                    <div className="md:col-span-4 flex items-center gap-4 min-w-0">
                                                        <div className="size-10 rounded-lg border border-white/10 bg-black flex items-center justify-center overflow-hidden shrink-0">
                                                            {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-white/20 text-lg">person</span>}
                                                        </div>
                                                        <div className="flex flex-col text-left overflow-hidden min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-white uppercase tracking-tight truncate text-sm">{u.username}</span>
                                                                {u.is_admin && <span className="px-1.5 py-px rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[9px] font-black shrink-0">ADMIN</span>}
                                                            </div>
                                                            <span className="text-[10px] font-mono text-white/30 truncate select-all">{u.id}</span>
                                                        </div>
                                                    </div>

                                                    {/* COL 2: CONTROLS (Span 4) */}
                                                    <div className="md:col-span-4 flex items-center justify-start md:justify-center gap-6 md:gap-8 border-t md:border-t-0 border-b md:border-b-0 border-white/5 py-3 md:py-0">

                                                        <div className="flex flex-col gap-1 items-center">
                                                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest hidden md:block">Clearance</span>
                                                            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/5">
                                                                <button
                                                                    onClick={() => {
                                                                        const currentLevel = Number(u.clearance_level);
                                                                        const newLevel = Math.max(0, currentLevel - 1);
                                                                        const newXp = newLevel * 1000;
                                                                        debugLog(`Level Decrease: ${currentLevel} -> ${newLevel}, XP -> ${newXp}`);
                                                                        updateUserStatus(u.id, { clearance_level: newLevel, experience_points: newXp });
                                                                    }}
                                                                    className="size-6 rounded hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                                                                >-</button>
                                                                <div className="flex flex-col items-center w-10">
                                                                    <span className="text-[10px] font-black text-emerald-400">L{u.clearance_level}</span>
                                                                    <span className="text-[7px] font-mono text-white/30">{u.experience_points}XP</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const currentLevel = Number(u.clearance_level);
                                                                        const newLevel = Math.min(10, currentLevel + 1);
                                                                        const newXp = newLevel * 1000;
                                                                        debugLog(`Level Increase: ${currentLevel} -> ${newLevel}, XP -> ${newXp}`);
                                                                        updateUserStatus(u.id, { clearance_level: newLevel, experience_points: newXp });
                                                                    }}
                                                                    className="size-6 rounded hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                                                                >+</button>
                                                            </div>
                                                        </div>

                                                        <div className="h-6 w-px bg-white/5 hidden md:block"></div>

                                                        <div className="flex flex-col gap-1 items-center">
                                                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest hidden md:block">Role</span>
                                                            <button
                                                                onClick={() => {
                                                                    if (u.id === user.id) return alert("Security Protocol: Self-demotion denied.");
                                                                    updateUserStatus(u.id, { is_admin: !u.is_admin });
                                                                }}
                                                                className={`h-[30px] px-3 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider border border-white/5 hover:border-white/20 flex items-center gap-2 ${u.is_admin
                                                                    ? 'bg-purple-500/10 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
                                                                    : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                                                                    }`}
                                                            >
                                                                {u.is_admin ? (
                                                                    <><span className="material-symbols-outlined text-[14px]">security</span> Admin</>
                                                                ) : (
                                                                    <><span className="material-symbols-outlined text-[14px]">person</span> User</>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* COL 3: STATUS & ACTIONS (Span 4) */}
                                                    <div className="md:col-span-4 flex items-center justify-start md:justify-end gap-5">

                                                        {/* PERMISSIONS ACTIONS - Hidden for Admins but kept as spacer for alignment */}
                                                        {u.is_admin ? (
                                                            <div className="w-[68px] hidden md:block"></div>
                                                        ) : (
                                                            <>
                                                                <div className="h-6 w-px bg-white/5 hidden md:block"></div>
                                                                <div className="flex flex-col gap-1 items-end min-w-[68px]">
                                                                    <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest hidden md:block">Overrides</span>
                                                                    <div className="flex gap-1">
                                                                        <button
                                                                            title="Toggle Terminal Access"
                                                                            onClick={() => {
                                                                                const current = u.permissions || {};
                                                                                updateUserStatus(u.id, { permissions: { ...current, terminal: !current.terminal } });
                                                                            }}
                                                                            className={`size-[30px] rounded-lg flex items-center justify-center border transition-all ${u.permissions?.terminal
                                                                                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                                                                                : 'bg-white/5 border-white/5 text-white/20 hover:text-white hover:border-white/20'}`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[16px]">terminal</span>
                                                                        </button>
                                                                        <button
                                                                            title="Toggle Intel Access"
                                                                            onClick={() => {
                                                                                const current = u.permissions || {};
                                                                                updateUserStatus(u.id, { permissions: { ...current, intel: !current.intel } });
                                                                            }}
                                                                            className={`size-[30px] rounded-lg flex items-center justify-center border transition-all ${u.permissions?.intel
                                                                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                                                                : 'bg-white/5 border-white/5 text-white/20 hover:text-white hover:border-white/20'}`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </>
                                                        )}

                                                        <div className="flex flex-col gap-1 items-end">
                                                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest hidden md:block">Verification</span>
                                                            <button
                                                                onClick={() => updateUserStatus(u.id, { is_approved: !u.is_approved })}
                                                                className={`h-[30px] px-3 rounded-lg text-[10px] font-black uppercase transition-all tracking-wider border flex items-center gap-2 ${u.is_approved
                                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                                                                    : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white'
                                                                    }`}
                                                            >
                                                                {u.is_approved ? 'Verified' : 'Pending'}
                                                            </button>
                                                        </div>

                                                        <div className="h-6 w-px bg-white/5 hidden md:block"></div>
                                                        <button
                                                            onClick={() => deleteUser(u.id)}
                                                            className="size-[30px] rounded-lg flex items-center justify-center bg-red-500/5 hover:bg-red-500/20 text-red-500/40 hover:text-red-500 transition-all border border-red-500/10"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* INTEL TAB */}
                                {activeTab === 'intel' && (
                                    <motion.div
                                        key="intel"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-6"
                                    >
                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{intel.length} Encrypted Assets</span>
                                            <button
                                                onClick={() => { setEditingIntel({ name: '', description: '', image_url: '', unlock_code: '', required_clearance: 1 }); setIntelModalOpen(true); setModalOpen(true); }}
                                                className="px-6 py-2.5 rounded-xl bg-emerald-500 text-black text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-lg">add</span>
                                                New Asset
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {intel.map(item => (
                                                <div key={item.id} className="glass-card rounded-3xl border border-white/5 bg-white/[0.01] overflow-hidden group hover:border-white/20 transition-all flex flex-col">
                                                    <div className="aspect-video w-full bg-black relative overflow-hidden">
                                                        <img
                                                            src={item.image_url}
                                                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-700"
                                                            onError={e => e.currentTarget.src = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop"}
                                                        />
                                                        <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-emerald-500/30 text-[9px] font-black text-emerald-400">LVL {item.required_clearance}</div>
                                                    </div>
                                                    <div className="p-4 flex flex-col gap-3 flex-1">
                                                        <div className="flex flex-col gap-1">
                                                            <h4 className="text-lg font-black uppercase tracking-tight text-white">{item.name}</h4>
                                                            <span className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">{item.unlock_code || 'AUTORUN_ON_CLEARANCE'}</span>
                                                        </div>
                                                        <p className="text-xs text-white/40 line-clamp-2 leading-relaxed h-10">{item.description}</p>
                                                        <div className="flex items-center gap-2 mt-auto pt-4 border-t border-white/5">
                                                            <button
                                                                onClick={() => { setEditingIntel(item); setIntelModalOpen(true); setModalOpen(true); }}
                                                                className="flex-1 h-10 rounded-xl bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white transition-all border border-white/5"
                                                            >Edit</button>
                                                            <button
                                                                onClick={() => deleteIntel(item.id)}
                                                                className="size-10 rounded-xl bg-red-500/5 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all border border-red-500/10"
                                                            >
                                                                <span className="material-symbols-outlined text-lg">delete</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* COMMS TAB */}
                                {activeTab === 'comms' && (
                                    <motion.div
                                        key="comms"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-6"
                                    >
                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{notifications.length} Active Banners</span>
                                            <button
                                                onClick={() => { setEditingNotification({ title: '', subtitle: '', message: '', icon: 'notification', style: 'banner-blue', enabled: true }); setNotificationModalOpen(true); setModalOpen(true); }}
                                                className="px-6 py-2.5 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-lg">add</span>
                                                New Banner
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {(() => {
                                                const readIds = user?.read_banner_ids || [];
                                                return notifications.length === 0 ? (
                                                    <div className="p-12 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.01]">
                                                        <p className="text-sm text-white/20 italic">No notification banners deployed.</p>
                                                    </div>
                                                ) : (
                                                    notifications.map(note => (
                                                        <div key={note.id} className="glass-card p-6 rounded-2xl border border-white/5 bg-white/[0.01] flex items-center justify-between group">
                                                            <div className="flex items-center gap-4">
                                                                <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 aspect-square ${note.style?.includes('red') ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                                                    note.style?.includes('purple') ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' :
                                                                        'bg-blue-500/10 border-blue-500/20 text-blue-500'
                                                                    }`}>
                                                                    <span className="material-symbols-outlined text-xl">{note.icon === 'notification' ? 'priority_high' : (note.icon || 'info')}</span>
                                                                </div>
                                                                <div className="flex flex-col gap-0.5">
                                                                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                                        <h4 className="font-black uppercase tracking-tight text-white text-sm">{note.title}</h4>
                                                                        {note.subtitle && (
                                                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded border ${note.style === 'banner-red' ? 'border-red-500/30 text-red-400' :
                                                                                note.style === 'banner-purple' ? 'border-purple-500/30 text-purple-400' :
                                                                                    'border-blue-500/30 text-blue-400'
                                                                                }`}>
                                                                                {note.subtitle}
                                                                            </span>
                                                                        )}
                                                                        {!note.enabled && <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/20">DISABLED</span>}
                                                                    </div>
                                                                    <p className="text-xs text-white/60 font-medium leading-relaxed line-clamp-2">{note.message.replace(/<[^>]*>?/gm, '')}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <button
                                                                    onClick={async () => {
                                                                        const updates = { enabled: !note.enabled };
                                                                        const { error } = await supabase.from('notifications').update(updates).eq('id', note.id);
                                                                        if (!error) {
                                                                            setNotifications(prev => prev.map(n => n.id === note.id ? { ...n, ...updates } : n));
                                                                        }
                                                                    }}
                                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${note.enabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                                                                >
                                                                    {note.enabled ? 'Enabled' : 'Disabled'}
                                                                </button>
                                                                <button onClick={() => { setEditingNotification(note); setNotificationModalOpen(true); setModalOpen(true); }} className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"><span className="material-symbols-outlined">edit</span></button>
                                                                <button onClick={() => deleteNotification(note.id)} className="size-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"><span className="material-symbols-outlined">delete</span></button>
                                                            </div>
                                                        </div>
                                                    ))
                                                );
                                            })()}
                                        </div>
                                    </motion.div>
                                )}

                                {/* ROADMAP TAB */}
                                {activeTab === 'roadmap' && (
                                    <motion.div
                                        key="roadmap"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-6"
                                    >

                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{roadmapItems.length} Roadmap Objectives</span>
                                            <button
                                                onClick={() => { setEditingRoadmap({ title: '', description: '', type: 'nextup', priority: 'Medium', column: 'backlog', progress: 0 }); setRoadmapModalOpen(true); setModalOpen(true); }}
                                                className="px-6 py-2.5 rounded-xl bg-purple-500 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-lg">add</span>
                                                New Objective
                                            </button>
                                        </div>

                                        <div className="flex gap-4 h-full overflow-x-auto pb-4 custom-scrollbar snap-x snap-mandatory px-1">
                                            {['backlog', 'nextup', 'inprogress', 'done'].map(status => {
                                                const statusLabel = status === 'nextup' ? 'Next Up' : status === 'inprogress' ? 'In Progress' : status;
                                                const statusColor = status === 'done' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' :
                                                    status === 'inprogress' ? 'text-blue-400 border-blue-500/20 bg-blue-500/5' :
                                                        status === 'nextup' ? 'text-purple-400 border-purple-500/20 bg-purple-500/5' :
                                                            'text-white/40 border-white/10 bg-white/5';

                                                const items = roadmapItems.filter(i => i.column === status);

                                                return (
                                                    <div
                                                        key={status}
                                                        className={`flex flex-col gap-3 min-w-[260px] w-[260px] shrink-0 h-full snap-start transition-colors rounded-xl p-2 border border-transparent ${draggedItem && draggedItem.column !== status ? 'bg-white/[0.02] border-white/5 border-dashed' : ''}`}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        onDrop={async (e) => {
                                                            e.preventDefault();
                                                            if (draggedItem && draggedItem.column !== status) {
                                                                const itemId = draggedItem.id;
                                                                // Optimistic update
                                                                setRoadmapItems(prev => prev.map(i => i.id === itemId ? { ...i, column: status } : i));

                                                                // DB Update
                                                                const { error } = await supabase.from('roadmap_items').update({ column: status }).eq('id', itemId);
                                                                if (error) {
                                                                    console.error('Failed to move item:', error);
                                                                    // Revert if error (optional, simple app)
                                                                }
                                                                setDraggedItem(null);
                                                            }
                                                        }}
                                                    >
                                                        <div className={`px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-[0.2em] flex justify-between items-center shrink-0 ${statusColor}`}>
                                                            {statusLabel}
                                                            <span className="opacity-50">{items.length}</span>
                                                        </div>

                                                        <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-2 custom-scrollbar flex-1">
                                                            {items.map(item => (
                                                                <div
                                                                    key={item.id}
                                                                    draggable
                                                                    onDragStart={() => setDraggedItem(item)}
                                                                    className={`glass-card p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group flex flex-col gap-3 relative overflow-hidden shrink-0 cursor-grab active:cursor-grabbing ${draggedItem?.id === item.id ? 'opacity-50' : ''}`}
                                                                >
                                                                    <div className="flex justify-between items-start">
                                                                        <h4 className="font-bold text-xs text-white leading-tight pointer-events-none">{item.title}</h4>
                                                                        <div className="flex gap-1" onMouseDown={e => e.stopPropagation()}>
                                                                            <button onClick={() => { setEditingRoadmap(item); setRoadmapModalOpen(true); setModalOpen(true); }} className="p-1 hover:text-white text-white/20 transition-colors cursor-pointer"><span className="material-symbols-outlined text-[14px]">edit</span></button>
                                                                            <button onClick={() => deleteRoadmapItem(item.id)} className="p-1 hover:text-red-400 text-white/20 transition-colors cursor-pointer"><span className="material-symbols-outlined text-[14px]">delete</span></button>
                                                                        </div>
                                                                    </div>

                                                                    {item.description && <p className="text-[10px] text-white/40 line-clamp-2">{item.description}</p>}

                                                                    <div className="flex items-center gap-2 mt-auto pt-2 border-t border-white/5">
                                                                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${item.priority === 'High' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                                                            item.priority === 'Medium' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                                                                'bg-white/5 border-white/10 text-white/30'
                                                                            }`}>{item.priority}</span>

                                                                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                                                            <div className={`h-full ${status === 'done' ? 'bg-emerald-500' : 'bg-purple-500'}`} style={{ width: `${item.progress}%` }} />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {items.length === 0 && (
                                                                <div className="h-24 rounded-xl border border-dashed border-white/5 flex items-center justify-center shrink-0">
                                                                    <span className="text-[9px] text-white/10 uppercase tracking-widest">Empty</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}

                                {/* BLOG TAB */}
                                {activeTab === 'blog' && (
                                    <motion.div
                                        key="blog"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-6"
                                    >
                                        <div className="flex items-center justify-between px-2">
                                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{blogPosts.length} Blog Articles</span>
                                            <button
                                                onClick={() => {
                                                    setEditingBlogPost({
                                                        title: '',
                                                        slug: '',
                                                        excerpt: '',
                                                        content: '',
                                                        cover_image_url: '',
                                                        status: 'draft',
                                                        is_featured: false,
                                                        required_clearance_level: 0,
                                                        tags: []
                                                    });
                                                    setBlogTagInput('');
                                                    setBlogModalOpen(true);
                                                    setModalOpen(true);
                                                    setBlogPreviewMode(false);
                                                }}
                                                className="px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-lg">add</span>
                                                New Article
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            {blogPosts.length === 0 ? (
                                                <div className="p-12 text-center border border-dashed border-white/5 rounded-3xl bg-white/[0.01]">
                                                    <p className="text-sm text-white/20 italic">No blog posts created yet.</p>
                                                </div>
                                            ) : (
                                                blogPosts.map(post => (
                                                    <div key={post.id} className="glass-card p-6 rounded-2xl border border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            {post.cover_image_url ? (
                                                                <img src={post.cover_image_url} alt="" className="size-16 rounded-xl object-cover shrink-0 border border-white/10" />
                                                            ) : (
                                                                <div className="size-16 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 text-white/20">
                                                                    <span className="material-symbols-outlined">article</span>
                                                                </div>
                                                            )}
                                                            <div className="flex flex-col gap-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <h4 className="font-black uppercase tracking-tight text-white text-sm truncate">{post.title}</h4>
                                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${post.status === 'published' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-white/5 border border-white/10 text-white/30'}`}>
                                                                        {post.status}
                                                                    </span>
                                                                    {post.is_featured && (
                                                                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                                                            Featured
                                                                        </span>
                                                                    )}
                                                                    {post.required_clearance_level > 0 && (
                                                                        <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                                                            LVL {post.required_clearance_level} Clearance
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[10px] text-white/40 font-mono truncate">/{post.slug}</p>
                                                                <p className="text-[10px] text-white/30">By {post.author_username || 'Admin'} • {post.tags?.join(', ') || 'No tags'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                onClick={() => duplicateBlogPost(post)}
                                                                className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all cursor-pointer"
                                                                title="Duplicate as draft"
                                                            >
                                                                <span className="material-symbols-outlined text-lg">content_copy</span>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingBlogPost(post);
                                                                    setBlogTagInput('');
                                                                    setBlogModalOpen(true);
                                                                    setModalOpen(true);
                                                                    setBlogPreviewMode(false);
                                                                }}
                                                                className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all cursor-pointer"
                                                            >
                                                                <span className="material-symbols-outlined text-lg">edit</span>
                                                            </button>
                                                            <button
                                                                onClick={() => deleteBlogPost(post.id)}
                                                                className="size-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                                                            >
                                                                <span className="material-symbols-outlined text-lg">delete</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </motion.div>
                                )}

                                {/* SETTINGS TAB */}
                                {activeTab === 'settings' && config && (
                                    <motion.div
                                        key="settings"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="flex flex-col gap-8"
                                    >
                                        {/* PRIMARY CONFIGURATION GRID */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            {/* SITE IDENTITY */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-6 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                    <span className="material-symbols-outlined text-[100px] rotate-12">public</span>
                                                </div>
                                                <div className="flex items-center gap-4 relative z-10">
                                                    <div className="size-12 rounded-[22px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-emerald-500 text-3xl">settings_ethernet</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">System Identity</h3>
                                                        <span className="text-[10px] font-black text-emerald-500/30 uppercase tracking-[0.3em]">Global metadata configuration</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-5 relative z-10">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Platform Title</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.siteInfo.title}
                                                            onBlur={(e) => updateGlobalConfig({ site_title: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm focus:border-emerald-500/50 outline-none transition-all focus:bg-white/[0.02]"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Manifesto / Description</label>
                                                        <textarea
                                                            defaultValue={config.siteInfo.description}
                                                            onBlur={(e) => updateGlobalConfig({ site_description: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl p-5 text-sm focus:border-emerald-500/50 outline-none h-32 resize-none transition-all focus:bg-white/[0.02]"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* TECHNICAL CORE */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-6 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                    <span className="material-symbols-outlined text-[100px] -rotate-12">terminal</span>
                                                </div>
                                                <div className="flex items-center gap-4 relative z-10">
                                                    <div className="size-12 rounded-[22px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-blue-500 text-3xl">developer_board</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Technical Core</h3>
                                                        <span className="text-[10px] font-black text-blue-500/30 uppercase tracking-[0.3em]">Protocol and repository alignment</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-5 relative z-10">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Relay IP / Domain</label>
                                                            <input
                                                                type="text"
                                                                defaultValue={config.serverMetadata.ip}
                                                                onBlur={(e) => updateGlobalConfig({ server_ip: e.target.value })}
                                                                className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm font-mono focus:border-blue-500/50 outline-none transition-all focus:bg-white/[0.02]"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Core Version</label>
                                                            <input
                                                                type="text"
                                                                defaultValue={config.serverMetadata.modpackVersion}
                                                                onBlur={(e) => updateGlobalConfig({ modpack_version: e.target.value })}
                                                                className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm font-mono focus:border-blue-500/50 outline-none transition-all focus:bg-white/[0.02]"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">GitHub Central Command</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.github.repository}
                                                            onBlur={(e) => updateGlobalConfig({ github_repository: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm font-mono focus:border-blue-500/50 outline-none transition-all focus:bg-white/[0.02]"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* MISSION TIMELINE (COUNTDOWN) */}
                                        <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                            <div className="absolute top-0 right-10 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                <span className="material-symbols-outlined text-[150px]">schedule</span>
                                            </div>

                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                                <div className="flex items-center gap-4">
                                                    <div className="size-12 rounded-[22px] bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-red-500 text-3xl">timer</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Mission Timeline</h3>
                                                        <span className="text-[10px] font-black text-red-500/30 uppercase tracking-[0.3em]">Temporal sync and countdown control</span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => updateGlobalConfig({ countdown_enabled: !config.countdown.enabled })}
                                                    className={`group/btn h-14 px-8 rounded-2xl flex items-center gap-4 transition-all duration-500 border overflow-hidden relative ${config.countdown.enabled ? 'bg-red-500 border-red-400/50 text-white' : 'bg-white/5 border-white/10 text-white/30'}`}
                                                >
                                                    <div className="flex flex-col items-start leading-none gap-0.5">
                                                        <span className="text-[10px] font-black uppercase tracking-widest">{config.countdown.enabled ? 'Active Sequence' : 'Sequence Halted'}</span>
                                                        <span className="text-xs font-black uppercase tracking-[0.2em]">{config.countdown.enabled ? 'ABORT_MISSION' : 'INITIATE_COUNTDOWN'}</span>
                                                    </div>
                                                    <span className={`material-symbols-outlined transition-transform duration-500 ${config.countdown.enabled ? 'group-hover/btn:rotate-90' : 'group-hover/btn:translate-x-1'}`}>
                                                        {config.countdown.enabled ? 'cancel' : 'play_arrow'}
                                                    </span>
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Event Directive (Title)</label>
                                                    <input
                                                        type="text"
                                                        defaultValue={config.countdown.title}
                                                        onBlur={(e) => updateGlobalConfig({ countdown_title: e.target.value })}
                                                        className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm focus:border-red-500/50 outline-none transition-all"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Target Coordinates (Date/Time)</label>
                                                    <input
                                                        type="datetime-local"
                                                        defaultValue={config.countdown.date ? new Date(config.countdown.date).toISOString().slice(0, 16) : ''}
                                                        onChange={(e) => updateGlobalConfig({ countdown_date: e.target.value })}
                                                        className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm focus:border-red-500/50 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* COMMUNITY & ROADMAP BRANDING */}
                                        <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                            <div className="absolute top-0 right-10 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                <span className="material-symbols-outlined text-[150px] -rotate-12">map</span>
                                            </div>

                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className="size-12 rounded-[22px] bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-purple-500 text-3xl">hub</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Roadmap & Community</h3>
                                                    <span className="text-[10px] font-black text-purple-500/30 uppercase tracking-[0.3em]">Branding and communication protocols</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                                                {/* Roadmap Branding Cluster */}
                                                <div className="flex flex-col gap-5">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">Roadmap Branding</span>
                                                        <div className="h-px flex-1 bg-purple-500/20"></div>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Main Header</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.feedbackRoadmap.sections.roadmap.title}
                                                            onBlur={(e) => updateGlobalConfig({ roadmap_title: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm focus:border-purple-500/50 outline-none transition-all"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Strategic Subtitle</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.feedbackRoadmap.sections.roadmap.subtitle}
                                                            onBlur={(e) => updateGlobalConfig({ roadmap_subtitle: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm focus:border-purple-500/50 outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Feedback Integration Cluster */}
                                                <div className="flex flex-col gap-5">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Feedback & Bugs</span>
                                                        <div className="h-px flex-1 bg-blue-500/20"></div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Bugs Title</label>
                                                            <input
                                                                type="text"
                                                                defaultValue={config.feedbackRoadmap.sections.feedback.title}
                                                                onBlur={(e) => updateGlobalConfig({ feedback_title: e.target.value })}
                                                                className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm focus:border-blue-500/50 outline-none transition-all"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Suggestions Title</label>
                                                            <input
                                                                type="text"
                                                                defaultValue={config.feedbackRoadmap.sections.suggestions.title}
                                                                onBlur={(e) => updateGlobalConfig({ suggestions_title: e.target.value })}
                                                                className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm focus:border-blue-500/50 outline-none transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Relay (Suggestions URL)</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.feedbackRoadmap.sections.suggestions.formspreeUrl}
                                                            onBlur={(e) => updateGlobalConfig({ suggestions_form_url: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm font-mono focus:border-blue-500/50 outline-none transition-all placeholder:text-white/5"
                                                            placeholder="https://formspree.io/f/..."
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Relay (Bugs URL)</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.feedbackRoadmap.sections.feedback.formspreeUrl}
                                                            onBlur={(e) => updateGlobalConfig({ feedback_form_url: e.target.value })}
                                                            className="bg-black/40 border border-white/10 rounded-2xl h-12 px-5 text-sm font-mono focus:border-blue-500/50 outline-none transition-all placeholder:text-white/5"
                                                            placeholder="https://formspree.io/f/..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* MCSS INTEGRATION SETTINGS */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-10 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                    <span className="material-symbols-outlined text-[150px]">key</span>
                                                </div>

                                                <div className="flex items-center gap-4 relative z-10">
                                                    <div className="size-12 rounded-[22px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-amber-500 text-3xl">api</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">MCSS Protocol</h3>
                                                        <span className="text-[10px] font-black text-amber-500/30 uppercase tracking-[0.3em]">Master API Key Automation</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-6 relative z-10">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">MCSS API Endpoint (Full URL)</label>
                                                        <input
                                                            key={`endpoint-${config.mcss?.defaultBaseUrl}`}
                                                            type="text"
                                                            defaultValue={config.mcss?.defaultBaseUrl}
                                                            onBlur={(e) => updateGlobalConfig({ mcss_api_url: e.target.value })}
                                                            className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm font-mono focus:border-amber-500/50 outline-none transition-all"
                                                            placeholder="https://server-manfredonia.ddns.net:25560"
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[9px] font-black uppercase text-amber-500/60 tracking-[0.2em] ml-1">Standard Master Key</label>
                                                            <input
                                                                type="password"
                                                                onBlur={(e) => {
                                                                    if (e.target.value.trim()) {
                                                                        updateMcssMasterKey('standard', e.target.value);
                                                                        e.target.value = ""; // Clear after update for maximum security
                                                                    }
                                                                }}
                                                                className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm font-mono focus:border-amber-500/50 outline-none transition-all"
                                                                placeholder="Type to update standard key..."
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <label className="text-[9px] font-black uppercase text-amber-500/60 tracking-[0.2em] ml-1">Admin Master Key</label>
                                                            <input
                                                                type="password"
                                                                onBlur={(e) => {
                                                                    if (e.target.value.trim()) {
                                                                        updateMcssMasterKey('admin', e.target.value);
                                                                        e.target.value = ""; // Clear after update for maximum security
                                                                    }
                                                                }}
                                                                className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm font-mono focus:border-amber-500/50 outline-none transition-all"
                                                                placeholder="Type to update admin key..."
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest text-center px-4">
                                                    [!IMPORTANT] I cambi qui influiranno sulle future assegnazioni. Gli utenti esistenti devono essere risincronizzati (cambiando il loro stato).
                                                </p>
                                            </div>

                                            {/* BLOG CONFIGURATION SETTINGS */}
                                            <div className="glass-card p-8 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col gap-8 relative overflow-hidden group">
                                                <div className="absolute top-0 right-10 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                    <span className="material-symbols-outlined text-[150px]">article</span>
                                                </div>

                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                                                    <div className="flex items-center gap-4">
                                                        <div className="size-12 rounded-[22px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-emerald-500 text-3xl">menu_book</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">Blog Protocol</h3>
                                                            <span className="text-[10px] font-black text-emerald-500/30 uppercase tracking-[0.3em]">Section toggle and title configuration</span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => updateGlobalConfig({ blog_enabled: !config.isBlogEnabled })}
                                                        className={`group/btn h-14 px-8 rounded-2xl flex items-center gap-4 transition-all duration-500 border overflow-hidden relative ${config.isBlogEnabled ? 'bg-emerald-500 border-emerald-400/50 text-white' : 'bg-white/5 border-white/10 text-white/30'}`}
                                                    >
                                                        <div className="flex flex-col items-start leading-none gap-0.5">
                                                            <span className="text-[10px] font-black uppercase tracking-widest">{config.isBlogEnabled ? 'Active Sequence' : 'Sequence Halted'}</span>
                                                            <span className="text-xs font-black uppercase tracking-[0.2em]">{config.isBlogEnabled ? 'BLOG_ENABLED' : 'BLOG_DISABLED'}</span>
                                                        </div>
                                                        <span className="material-symbols-outlined transition-transform duration-500">
                                                            {config.isBlogEnabled ? 'toggle_on' : 'toggle_off'}
                                                        </span>
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Blog Section Title</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.blogTitle}
                                                            onBlur={(e) => updateGlobalConfig({ blog_title: e.target.value })}
                                                            className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm focus:border-emerald-500/50 outline-none transition-all"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-2">
                                                        <label className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em] ml-1">Blog Section Subtitle</label>
                                                        <input
                                                            type="text"
                                                            defaultValue={config.blogSubtitle}
                                                            onBlur={(e) => updateGlobalConfig({ blog_subtitle: e.target.value })}
                                                            className="bg-black/60 border border-white/10 rounded-2xl h-14 px-6 text-sm focus:border-emerald-500/50 outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )
                        }
                    </div >
                </div >

                {/* INTEL MODAL */}
                <AnimatePresence>
                    {
                        isIntelModalOpen && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
                            >
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
                                >
                                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                        <h3 className="text-xl font-black uppercase tracking-tight">{editingIntel?.id ? 'Edit Intel' : 'Register New Intel'}</h3>
                                        <button onClick={() => { setIntelModalOpen(false); setModalOpen(false); }} className="text-white/20 hover:text-white transition-colors">
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>

                                    <form onSubmit={saveIntel} className="p-6 flex flex-col gap-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Asset Name</label>
                                                <input required type="text" value={editingIntel?.name ?? ''} onChange={e => setEditingIntel(p => ({ ...p!, name: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none" placeholder="CODEX_XI" />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Unlock Code</label>
                                                <input type="text" value={editingIntel?.unlock_code ?? ''} onChange={e => setEditingIntel(p => ({ ...p!, unlock_code: e.target.value.toUpperCase() }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm font-mono focus:border-emerald-500/50 outline-none" placeholder="AUTO_INJECT" />
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Image URL</label>
                                            <input required type="text" value={editingIntel?.image_url ?? ''} onChange={e => setEditingIntel(p => ({ ...p!, image_url: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none" placeholder="https://..." />
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Clearance Level Required</label>
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="range" min="1" max="10" step="1"
                                                    value={editingIntel?.required_clearance || 1}
                                                    onChange={e => setEditingIntel(p => ({ ...p!, required_clearance: parseInt(e.target.value) }))}
                                                    className="flex-1 accent-emerald-500"
                                                />
                                                <span className="text-xl font-black text-emerald-500 w-8">LV.{editingIntel?.required_clearance || 1}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Detailed Description</label>
                                            <textarea required value={editingIntel?.description ?? ''} onChange={e => setEditingIntel(p => ({ ...p!, description: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:border-emerald-500/50 outline-none h-32 resize-none" placeholder="Contenuto segreto..." />
                                        </div>

                                        <button type="submit" className="w-full h-14 bg-emerald-500 text-black font-black uppercase tracking-[0.3em] rounded-2xl hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all">
                                            Confirm Entry
                                        </button>
                                    </form>
                                </motion.div>
                            </motion.div>
                        )
                    }
                </AnimatePresence >

                {/* NOTIFICATION MODAL */}
                <AnimatePresence>
                    {
                        isNotificationModalOpen && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                        <h3 className="text-xl font-black uppercase tracking-tight">{editingNotification?.id ? 'Edit Banner' : 'Deploy New Banner'}</h3>
                                        <button onClick={() => { setNotificationModalOpen(false); setModalOpen(false); }} className="text-white/20 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
                                    </div>
                                    <form onSubmit={saveNotification} className="p-6 flex flex-col gap-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Headline</label>
                                                <input required type="text" value={editingNotification?.title ?? ''} onChange={e => setEditingNotification(p => ({ ...p!, title: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-blue-500/50 outline-none" placeholder="SECURITY_ALERT" />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Subtitle</label>
                                                <input type="text" value={editingNotification?.subtitle ?? ''} onChange={e => setEditingNotification(p => ({ ...p!, subtitle: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-blue-500/50 outline-none" placeholder="Optional context" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Icon</label>
                                                <select value={editingNotification?.icon ?? 'notification'} onChange={e => setEditingNotification(p => ({ ...p!, icon: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-blue-500/50 outline-none">
                                                    <option value="notification" className="bg-[#1a1a1a]">Standard</option>
                                                    <option value="warning" className="bg-[#1a1a1a]">Warning</option>
                                                    <option value="bolt" className="bg-[#1a1a1a]">Action</option>
                                                    <option value="emergency" className="bg-[#1a1a1a]">Emergency</option>
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Style</label>
                                                <select value={editingNotification?.style ?? 'banner-blue'} onChange={e => setEditingNotification(p => ({ ...p!, style: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-blue-500/50 outline-none">
                                                    <option value="banner-blue" className="bg-[#1a1a1a]">Blue (Info)</option>
                                                    <option value="banner-red" className="bg-[#1a1a1a]">Red (Alert)</option>
                                                    <option value="banner-purple" className="bg-[#1a1a1a]">Purple (Special)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Message (HTML Allowed)</label>
                                            <textarea required value={editingNotification?.message ?? ''} onChange={e => setEditingNotification(p => ({ ...p!, message: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:border-blue-500/50 outline-none h-32 resize-none" placeholder="System maintenance starting..." />
                                        </div>
                                        <button type="submit" className="w-full h-14 bg-blue-500 text-white font-black uppercase tracking-[0.3em] rounded-2xl hover:shadow-[0_0_40px_rgba(59,130,246,0.3)] transition-all">Broadcast Update</button>
                                    </form>
                                </motion.div>
                            </motion.div>
                        )
                    }
                </AnimatePresence >

                {/* ROADMAP MODAL */}
                <AnimatePresence>
                    {
                        roadmapModalOpen && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                        <h3 className="text-xl font-black uppercase tracking-tight">{editingRoadmap?.id ? 'Adjust Objective' : 'New Roadmap Objective'}</h3>
                                        <button onClick={() => { setRoadmapModalOpen(false); setModalOpen(false); }} className="text-white/20 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
                                    </div>
                                    <form onSubmit={saveRoadmapItem} className="p-6 flex flex-col gap-5">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Task Title</label>
                                            <input required type="text" value={editingRoadmap?.title ?? ''} onChange={e => setEditingRoadmap(p => ({ ...p!, title: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-purple-500/50 outline-none" placeholder="Server Optimization" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Current Column</label>
                                                <select value={editingRoadmap?.column ?? 'backlog'} onChange={e => setEditingRoadmap(p => ({ ...p!, column: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-purple-500/50 outline-none">
                                                    <option value="backlog" className="bg-[#1a1a1a]">Backlog</option>
                                                    <option value="nextup" className="bg-[#1a1a1a]">Next Up</option>
                                                    <option value="inprogress" className="bg-[#1a1a1a]">In Progress</option>
                                                    <option value="done" className="bg-[#1a1a1a]">Completed</option>
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Priority</label>
                                                <select value={editingRoadmap?.priority ?? 'Medium'} onChange={e => setEditingRoadmap(p => ({ ...p!, priority: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-purple-500/50 outline-none">
                                                    <option value="High" className="bg-[#1a1a1a]">High</option>
                                                    <option value="Medium" className="bg-[#1a1a1a]">Medium</option>
                                                    <option value="Low" className="bg-[#1a1a1a]">Low</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Progress ({editingRoadmap?.progress || 0}%)</label>
                                            <input type="range" min="0" max="100" step="5" value={editingRoadmap?.progress || 0} onChange={e => setEditingRoadmap(p => ({ ...p!, progress: parseInt(e.target.value) }))} className="accent-purple-500" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Briefing</label>
                                            <textarea value={editingRoadmap?.description ?? ''} onChange={e => setEditingRoadmap(p => ({ ...p!, description: e.target.value }))} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:border-purple-500/50 outline-none h-24 resize-none" placeholder="Technical details..." />
                                        </div>
                                        <button type="submit" className="w-full h-14 bg-purple-500 text-white font-black uppercase tracking-[0.3em] rounded-2xl hover:shadow-[0_0_40px_rgba(168,85,247,0.3)] transition-all">Update Roadmap</button>
                                    </form>
                                </motion.div>
                            </motion.div>
                        )
                    }
                </AnimatePresence>

                {/* BLOG POST MODAL */}
                <AnimatePresence>
                    {
                        blogModalOpen && editingBlogPost && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                                    <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                                        <div>
                                            <h3 className="text-xl font-black uppercase tracking-tight">
                                                {editingBlogPost.id ? 'Edit Blog Article' : 'Write New Article'}
                                            </h3>
                                            <p className="text-[10px] font-mono text-white/30 uppercase mt-1">Blog Content Engine v1.0</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setBlogPreviewMode(!blogPreviewMode)}
                                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${blogPreviewMode ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}`}
                                            >
                                                {blogPreviewMode ? 'Editor Mode' : 'Live Preview'}
                                            </button>
                                            <button onClick={() => { setBlogModalOpen(false); setModalOpen(false); setEditingBlogPost(null); }} className="text-white/20 hover:text-white transition-colors cursor-pointer">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                    </div>

                                    {blogPreviewMode ? (
                                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                                            {/* Preview mode rendering */}
                                            <div className="max-w-3xl mx-auto flex flex-col gap-6">
                                                {editingBlogPost.cover_image_url && (
                                                    <img src={editingBlogPost.cover_image_url} alt="" className="w-full h-64 object-cover rounded-2xl border border-white/10" />
                                                )}
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${editingBlogPost.status === 'published' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-white/5 border border-white/10 text-white/30'}`}>{editingBlogPost.status}</span>
                                                        {editingBlogPost.is_featured && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">Featured</span>}
                                                    </div>
                                                    <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white">{editingBlogPost.title || 'Untitled Post'}</h1>
                                                    <p className="text-sm text-white/40">{editingBlogPost.excerpt || 'No excerpt configured.'}</p>
                                                </div>
                                                <hr className="border-white/5" />
                                                <div className="prose prose-invert text-sm text-white/70 leading-relaxed font-sans whitespace-pre-wrap">
                                                    {editingBlogPost.content || 'Start typing in Editor Mode to see your post content here.'}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <form onSubmit={saveBlogPost} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 custom-scrollbar">
                                            {/* Article Title */}
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Title</label>
                                                <input
                                                    required
                                                    type="text"
                                                    value={editingBlogPost.title ?? ''}
                                                    onChange={e => {
                                                        const title = e.target.value;
                                                        const autoSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                                                        setEditingBlogPost(p => ({ ...p!, title, slug: p!.id ? p!.slug : autoSlug }));
                                                    }}
                                                    className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none"
                                                    placeholder="The New Community Hub Deployment"
                                                />
                                            </div>

                                            {/* Slug */}
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">URL Slug</label>
                                                <input
                                                    required
                                                    type="text"
                                                    value={editingBlogPost.slug ?? ''}
                                                    onChange={e => setEditingBlogPost(p => ({ ...p!, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '') }))}
                                                    className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none font-mono"
                                                    placeholder="new-community-hub"
                                                />
                                            </div>

                                            {/* Cover Image URL */}
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Cover Image URL</label>
                                                <input
                                                    type="text"
                                                    value={editingBlogPost.cover_image_url ?? ''}
                                                    onChange={e => setEditingBlogPost(p => ({ ...p!, cover_image_url: e.target.value }))}
                                                    className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none"
                                                    placeholder="https://example.com/cover.png"
                                                />
                                            </div>

                                            {/* Excerpt */}
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Excerpt / Summary</label>
                                                <textarea
                                                    value={editingBlogPost.excerpt ?? ''}
                                                    onChange={e => setEditingBlogPost(p => ({ ...p!, excerpt: e.target.value }))}
                                                    className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm focus:border-emerald-500/50 outline-none h-20 resize-none"
                                                    placeholder="Brief overview of the article..."
                                                />
                                            </div>

                                            {/* Tags Input */}
                                            <div className="flex flex-col gap-1.5">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Tags (Press Enter to add)</label>
                                                <div className="flex flex-wrap gap-2 p-2 bg-white/5 border border-white/10 rounded-xl min-h-[50px] items-center">
                                                    {editingBlogPost.tags?.map(t => (
                                                        <span key={t} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-white/10 px-2.5 py-1 rounded-full text-white/80">
                                                            {t}
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingBlogPost(p => ({ ...p!, tags: p!.tags.filter(tag => tag !== t) }))}
                                                                className="text-white/40 hover:text-white"
                                                            >
                                                                <span className="material-symbols-outlined text-[12px] leading-none">close</span>
                                                            </button>
                                                        </span>
                                                    ))}
                                                    <input
                                                        type="text"
                                                        value={blogTagInput}
                                                        onChange={e => setBlogTagInput(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const tag = blogTagInput.trim().toUpperCase();
                                                                if (tag && !editingBlogPost.tags?.includes(tag)) {
                                                                    setEditingBlogPost(p => ({ ...p!, tags: [...(p!.tags || []), tag] }));
                                                                }
                                                                setBlogTagInput('');
                                                            }
                                                        }}
                                                        placeholder="Add tag..."
                                                        className="bg-transparent text-sm outline-none px-2 py-1 flex-1 min-w-[120px]"
                                                    />
                                                </div>
                                            </div>

                                            {/* Controls row */}
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Publish Status</label>
                                                    <select
                                                        value={editingBlogPost.status ?? 'draft'}
                                                        onChange={e => setEditingBlogPost(p => ({ ...p!, status: e.target.value }))}
                                                        className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none"
                                                    >
                                                        <option value="draft" className="bg-[#1a1a1a]">Draft</option>
                                                        <option value="published" className="bg-[#1a1a1a]">Published</option>
                                                    </select>
                                                </div>

                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Required Clearance</label>
                                                    <select
                                                        value={editingBlogPost.required_clearance_level ?? 0}
                                                        onChange={e => setEditingBlogPost(p => ({ ...p!, required_clearance_level: parseInt(e.target.value) }))}
                                                        className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none"
                                                    >
                                                        <option value={0} className="bg-[#1a1a1a]">None (Public)</option>
                                                        <option value={1} className="bg-[#1a1a1a]">Initiate (Lvl 1)</option>
                                                        <option value={4} className="bg-[#1a1a1a]">Operative (Lvl 4)</option>
                                                        <option value={7} className="bg-[#1a1a1a]">Elite (Lvl 7)</option>
                                                        <option value={9} className="bg-[#1a1a1a]">Legacy (Lvl 9)</option>
                                                    </select>
                                                </div>

                                                <div className="flex flex-col gap-1.5">
                                                    <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Published At (Schedule)</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={editingBlogPost.published_at ? new Date(editingBlogPost.published_at).toISOString().slice(0, 16) : ''}
                                                        onChange={e => setEditingBlogPost(p => ({ ...p!, published_at: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
                                                        className="bg-white/5 border border-white/10 rounded-xl h-12 px-4 text-sm focus:border-emerald-500/50 outline-none text-white"
                                                    />
                                                </div>

                                                <div className="flex items-center gap-6 h-12 mt-6 pl-2">
                                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={editingBlogPost.is_featured ?? false}
                                                            onChange={e => setEditingBlogPost(p => ({ ...p!, is_featured: e.target.checked }))}
                                                            className="accent-emerald-500 size-4"
                                                        />
                                                        <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Featured</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Content Markdown Area */}
                                            <div className="flex flex-col gap-1.5 flex-grow">
                                                <label className="text-[9px] font-black uppercase text-white/30 tracking-widest">Article Body (Markdown)</label>
                                                <textarea
                                                    required
                                                    value={editingBlogPost.content ?? ''}
                                                    onChange={e => setEditingBlogPost(p => ({ ...p!, content: e.target.value }))}
                                                    className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm font-mono focus:border-emerald-500/50 outline-none h-72 resize-y"
                                                    placeholder="# Write post header&#10;&#10;Write post body content with **markdown**..."
                                                />
                                            </div>

                                            <button type="submit" className="w-full h-14 bg-emerald-500 text-white font-black uppercase tracking-[0.3em] rounded-2xl hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all shrink-0">
                                                {editingBlogPost.id ? 'Save Article' : 'Publish Article'}
                                            </button>
                                        </form>
                                    )}
                                </motion.div>
                            </motion.div>
                        )
                    }
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Admin;
