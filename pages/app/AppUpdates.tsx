import React, { useState, useEffect } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useAuth } from '../../contexts/AuthContext';
import { getReleases } from '../../utils/githubCache';
import { motion, AnimatePresence } from 'framer-motion';

interface ReleaseUpdate {
    version: string;
    date: string;
    title: string;
    body: string;
    id: number;
}

const AppUpdates: React.FC = () => {
    const { config } = useConfig();
    const { user } = useAuth();
    const [releases, setReleases] = useState<ReleaseUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedIds, setExpandedIds] = useState<number[]>([]);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Simple Markdown to HTML parser ported from Updates.tsx
    const markdownToHtml = (text: string) => {
        if (!text) return '';
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        html = html.replace(/`([^`]+?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-[10px] border border-white/10">$1</code>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline">$1</a>');
        html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
        html = html.replace(/\*([^*\n]+?)\*/g, '<em class="text-white/80 italic">$1</em>');
        html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-white mt-4 mb-2 text-md font-black uppercase">$1</h3>');
        html = html.replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 mb-1 list-disc text-white/70 pl-1 text-[11px]">$1</li>');
        html = html.replace(/\n\n+/g, '</p><p class="mb-3">');
        html = html.replace(/\n/g, '<br>');

        return '<p class="mb-2">' + html + '</p>';
    };

    useEffect(() => {
        if (!config?.github?.repository) return;

        const fetchReleases = async () => {
            setLoading(true);
            try {
                const data = await getReleases(config.github.repository, 10);
                const releasesData = data.slice(0, 5).map((release: any) => ({
                    version: release.tag_name,
                    date: new Date(release.published_at).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    }),
                    title: release.name || release.tag_name,
                    body: release.body,
                    id: release.id
                }));
                setReleases(releasesData);
                if (releasesData.length > 0) setExpandedIds([releasesData[0].id]);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchReleases();
    }, [config]);

    const toggleExpand = (id: number) => {
        setExpandedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    if (!user) return null;

    return (
        <div className="bg-[#050505] min-h-screen text-white font-sans overflow-x-hidden pb-40">
            <header className={`fixed top-0 left-0 w-full z-[80] transition-all duration-300 ${scrolled ? 'bg-black/80 backdrop-blur-2xl border-b border-white/5' : 'bg-transparent'}`}>
                <div className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+0.5rem)] pb-5 max-w-2xl mx-auto flex items-center gap-4">
                    <div className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
                        <span className="material-symbols-outlined text-lg text-purple-400">new_releases</span>
                    </div>
                    <h1 className="font-black text-white uppercase tracking-tighter text-lg italic leading-none">Intel_Stream</h1>
                </div>
            </header>

            <main className="px-6 pt-[calc(env(safe-area-inset-top,1.5rem)+7rem)] flex flex-col gap-6 max-w-2xl mx-auto">
                {/* Global Title Signature */}
                <section className="mb-4">
                    <h1 className="text-6xl font-black leading-none tracking-[-0.05em] text-white uppercase italic opacity-20 select-none">
                        INTEL<span className="not-italic opacity-20">_HUB</span>
                    </h1>
                </section>

                {/* Essential Wiki Module */}
                <section className="space-y-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 px-4">Tactical_Knowledge</span>
                    <a
                        href="https://manfredonia-pack-wiki.netlify.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 to-blue-500/10 backdrop-blur-xl relative overflow-hidden group active:scale-[0.98] transition-all"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:rotate-12 transition-transform">
                            <span className="material-symbols-outlined text-4xl">travel_explore</span>
                        </div>
                        <div className="relative z-10 space-y-2">
                            <h2 className="text-xl font-black uppercase italic tracking-tighter">Central_Wiki</h2>
                            <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Access interactive deployment guides</p>
                        </div>
                    </a>
                </section>

                {/* Release Intelligence */}
                <section className="space-y-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 px-4">Operational_Logs</span>

                    {loading ? (
                        <div className="flex flex-col gap-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-24 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <AnimatePresence>
                                {releases.map((release) => (
                                    <motion.div
                                        key={release.id}
                                        layout
                                        className={`rounded-2xl border transition-all duration-300 overflow-hidden ${expandedIds.includes(release.id) ? 'bg-[#0A0A0A]/60 border-white/20' : 'bg-[#0A0A0A]/40 border-white/5'}`}
                                    >
                                        <button
                                            onClick={() => toggleExpand(release.id)}
                                            className="w-full p-6 flex flex-col gap-1 text-left relative"
                                        >
                                            <div className="flex justify-between items-center w-full mb-1">
                                                <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">{release.date}</span>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{release.version}</span>
                                            </div>
                                            <div className="flex justify-between items-center gap-4">
                                                <h3 className="text-lg font-black uppercase italic tracking-tighter text-white pr-8 leading-tight">{release.title}</h3>
                                                <span className={`material-symbols-outlined text-white/20 transition-transform duration-300 ${expandedIds.includes(release.id) ? 'rotate-180' : ''}`}>expand_more</span>
                                            </div>
                                        </button>

                                        {expandedIds.includes(release.id) && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="px-6 pb-6"
                                            >
                                                <div className="h-px bg-white/5 w-full mb-6" />
                                                <div
                                                    className="text-[11px] font-mono text-white/50 leading-relaxed uppercase tracking-tight max-h-[300px] overflow-y-auto pr-2"
                                                    dangerouslySetInnerHTML={{ __html: markdownToHtml(release.body) }}
                                                />
                                            </motion.div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default AppUpdates;
