
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { BlogPost } from '../types';
import BlogPostCard from '../components/BlogPostCard';
import MobilePageShell from '../components/MobilePageShell';
import { isMobilePhone } from '../utils/deviceDetection';

const POSTS_PER_PAGE = 6;

const Blog: React.FC = () => {
  const { config } = useConfig();
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    document.title = `${config?.blogTitle || 'Blog'} — Server Manfredonia`;
    return () => { document.title = 'Server Manfredonia'; };
  }, [config?.blogTitle]);

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('blog_posts')
          .select('*, author:profiles!author_id(username)')
          .eq('status', 'published')
          .lte('published_at', new Date().toISOString())
          .order('published_at', { ascending: false });

        if (fetchError) throw fetchError;

        const mapped: BlogPost[] = (data || []).map((p: any) => ({
          ...p,
          author_username: p.author?.username || 'Admin',
        }));

        // Filter by clearance level
        const filtered = mapped.filter(p =>
          p.required_clearance_level === 0 ||
          (user && user.clearance_level >= p.required_clearance_level)
        );

        setPosts(filtered);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [user]);

  // All unique tags from posts
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    posts.forEach(p => p.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [posts]);

  // Featured posts (shown above the grid)
  const featuredPosts = useMemo(() =>
    posts.filter(p => p.is_featured).slice(0, 1),
    [posts]
  );

  // Filtered posts
  const filteredPosts = useMemo(() => {
    let result = posts;
    if (selectedTag) {
      result = result.filter(p => p.tags?.includes(selectedTag));
    }
    return result;
  }, [posts, selectedTag]);

  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  const handleTagClick = (tag: string) => {
    setSelectedTag(prev => prev === tag ? null : tag);
    setCurrentPage(1);
  };


  const wrapMobile = (content: React.ReactNode) =>
    isMobilePhone() ? (
      <MobilePageShell subtitle="Blog" activeNav="blog">{content}</MobilePageShell>
    ) : content;

  if (loading) {
    return wrapMobile(
      <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col gap-12">
        <header className="flex flex-col gap-4">
          <div className="h-16 w-64 bg-white/5 rounded-2xl animate-pulse" />
          <div className="h-5 w-80 bg-white/5 rounded-xl animate-pulse" />
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card rounded-2xl overflow-hidden border border-white/5 animate-pulse">
              <div className="h-48 bg-white/5" />
              <div className="p-5 flex flex-col gap-3">
                <div className="h-3 w-20 bg-white/5 rounded-full" />
                <div className="h-5 w-full bg-white/5 rounded-xl" />
                <div className="h-4 w-3/4 bg-white/5 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return wrapMobile(
    <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col gap-12">
      {/* Header */}
      <header className="flex flex-col gap-4">
        <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase text-white">
          {config?.blogTitle || 'Blog'}{' '}
          <span className="text-white/30">Posts</span>
        </h1>
        <p className="text-gray-400 max-w-2xl text-lg font-light">
          {config?.blogSubtitle || 'News e aggiornamenti dalla community.'}
        </p>
      </header>

      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              id={`tag-filter-${tag}`}
              onClick={() => handleTagClick(tag)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-200 ${
                selectedTag === tag
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-white/40 border-white/10 hover:text-white hover:border-white/30'
              }`}
            >
              {tag}
            </button>
          ))}
          {selectedTag && (
            <button
              onClick={() => setSelectedTag(null)}
              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20 text-white/40 hover:text-white transition-all flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[12px]">close</span>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="glass-card rounded-2xl p-8 border border-red-500/20 flex items-center gap-4">
          <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          <div>
            <p className="font-bold text-white">Errore nel caricamento</p>
            <p className="text-sm text-white/40">{error}</p>
          </div>
        </div>
      )}

      {/* Featured post (only when no filters active) */}
      {!selectedTag && featuredPosts.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em] mb-4">In Evidenza</h3>
          <FeaturedPostBanner post={featuredPosts[0]} />
        </div>
      )}

      {/* Posts grid */}
      {!error && (
        <div>
          {selectedTag && (
            <div className="flex items-center gap-3 mb-6">
              <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">
                {filteredPosts.length} {filteredPosts.length === 1 ? 'Risultato' : 'Risultati'}
              </h3>
            </div>
          )}

          {paginatedPosts.length === 0 ? (
            <EmptyState hasFilter={!!selectedTag} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedTag}-${currentPage}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {paginatedPosts.map(post => (
                  <BlogPostCard key={post.id} post={post} />
                ))}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                id="blog-prev-page"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  id={`blog-page-${i + 1}`}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`size-10 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${
                    currentPage === i + 1
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                id="blog-next-page"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="size-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Featured banner for highlighted posts
const FeaturedPostBanner: React.FC<{ post: BlogPost }> = ({ post }) => {
  const readingTime = Math.max(1, Math.ceil(post.content.trim().split(/\s+/).length / 200));
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group relative flex flex-col md:flex-row glass-card rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
    >
      {post.cover_image_url && (
        <div className="relative md:w-1/2 h-56 md:h-auto overflow-hidden shrink-0">
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/60" />
        </div>
      )}
      <div className="flex flex-col justify-center p-8 gap-4 flex-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-amber-400">star</span>
          <span className="text-[9px] font-black text-amber-400 uppercase tracking-[0.3em]">In Evidenza</span>
        </div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white group-hover:text-white/90 transition-colors">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="text-sm text-white/50 leading-relaxed line-clamp-3">{post.excerpt}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-white/30 font-mono">
          {post.published_at && (
            <span>{new Date(post.published_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          )}
          <span>{readingTime} min di lettura</span>
        </div>
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map(tag => (
              <span key={tag} className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};

// Empty state
const EmptyState: React.FC<{ hasFilter: boolean }> = ({ hasFilter }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-card rounded-2xl p-16 flex flex-col items-center justify-center gap-4 text-center border border-white/5"
  >
    <span className="material-symbols-outlined text-6xl text-white/10">
      {hasFilter ? 'search_off' : 'article'}
    </span>
    <h3 className="text-xl font-black uppercase tracking-tight text-white/30">
      {hasFilter ? 'Nessun risultato' : 'Nessun articolo pubblicato ancora'}
    </h3>
    <p className="text-sm text-white/20 max-w-xs leading-relaxed">
      {hasFilter
        ? 'Prova a cambiare filtro o termine di ricerca.'
        : 'I nuovi articoli appariranno qui non appena verranno pubblicati.'}
    </p>
  </motion.div>
);

export default Blog;
