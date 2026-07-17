
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BlogPost } from '../types';
import MobilePageShell from '../components/MobilePageShell';
import { isMobilePhone } from '../utils/deviceDetection';

const estimateReadingTime = (content: string): number => {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
};

// Extract YouTube video ID from various URL formats
const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^#\&\?\n]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const linkifyRawText = (htmlText: string): string => {
  const parts = htmlText.split(/(<\/?[a-zA-Z0-9]+(?:\s+[^>]*?)?>|__IMG_PLACEHOLDER_\d+__)/g);
  const openTags: string[] = [];
  
  const result = parts.map(part => {
    if (part.startsWith('<')) {
      const isClosing = part.startsWith('</');
      const match = part.match(/^<\/?([a-zA-Z0-9]+)/);
      if (match) {
        const tagName = match[1].toLowerCase();
        if (['a', 'code', 'pre'].includes(tagName)) {
          if (isClosing) {
            const idx = openTags.lastIndexOf(tagName);
            if (idx !== -1) {
              openTags.splice(idx, 1);
            }
          } else {
            openTags.push(tagName);
          }
        }
      }
      return part;
    } else if (part.startsWith('__IMG_PLACEHOLDER_')) {
      return part;
    } else {
      if (openTags.length === 0) {
        return part.replace(/(https?:\/\/[^\s&<"]+)/gi, (match) => {
          let url = match;
          let suffix = '';
          const trailingPunctuation = /[.,;:?!)]+$/;
          const trailingMatch = url.match(trailingPunctuation);
          if (trailingMatch) {
            const trailingStr = trailingMatch[0];
            let trimLen = 0;
            for (let i = trailingStr.length - 1; i >= 0; i--) {
              const char = trailingStr[i];
              if (char === ')') {
                const openCount = (url.slice(0, url.length - trimLen - 1).match(/\(/g) || []).length;
                const closeCount = (url.slice(0, url.length - trimLen - 1).match(/\)/g) || []).length;
                if (closeCount >= openCount) {
                  trimLen++;
                } else {
                  break;
                }
              } else {
                trimLen++;
              }
            }
            if (trimLen > 0) {
              suffix = url.slice(-trimLen);
              url = url.slice(0, -trimLen);
            }
          }
          return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors">${url}</a>${suffix}`;
        });
      }
      return part;
    }
  });

  return result.join('');
};

const markdownToHtml = (text: string, youtubeUrl?: string): string => {
  if (!text) return '';

  // First, extract images and replace with unique placeholders
  const images: {url: string, alt: string}[] = [];
  let processedText = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const index = images.length;
    images.push({url, alt});
    return `__IMG_PLACEHOLDER_${index}__`;
  });

  // Also detect direct image URLs (without markdown syntax)
  processedText = processedText.replace(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp))/gi, (match, url) => {
    const index = images.length;
    images.push({url, alt: ''});
    return `__IMG_PLACEHOLDER_${index}__`;
  });

  let html = processedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gm, (_m, _lang, code) =>
    `<pre class="bg-white/5 border border-white/10 rounded-xl p-4 my-4 overflow-x-auto"><code class="font-mono text-sm text-emerald-300">${code.trimEnd()}</code></pre>`
  );
  // Inline code
  html = html.replace(/`([^`]+?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-sm border border-white/10">$1</code>');
  // Links (Markdown)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors">$1</a>');
  // Bold
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
  // Italic
  html = html.replace(/\*([^*\n]+?)\*/g, '<em class="text-white/80 italic">$1</em>');
  // Blockquote
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="border-l-4 border-white/20 pl-4 my-3 text-white/50 italic">$1</blockquote>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-white mt-8 mb-3 text-xl font-black uppercase italic tracking-tighter border-l-4 border-white/20 pl-4">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-white mt-10 mb-4 text-2xl font-black uppercase italic tracking-tighter border-l-4 border-white/30 pl-4">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-white mt-12 mb-5 text-3xl font-black uppercase italic tracking-tighter border-l-4 border-white/40 pl-4">$1</h1>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="border-white/10 my-8" />');
  // Unordered list
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li class="ml-5 mb-2 list-disc text-white/80 pl-1">$1</li>');
  // Ordered list
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="ml-5 mb-2 list-decimal text-white/80 pl-1">$1</li>');
  // Wrap lists
  html = html.replace(/(<li[^>]*>.*?<\/li>(?:\s*<li[^>]*>.*?<\/li>)*)/gs, '<ul class="my-4 pl-2">$1</ul>');

  // Convert plain text URLs to clickable links
  html = linkifyRawText(html);

  // Simple approach: replace double newlines with paragraph breaks, single newlines with br
  html = html.replace(/\n\n+/g, '</p><p class="mb-4 text-white/80 leading-relaxed">');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = '<p class="mb-4 text-white/80 leading-relaxed">' + html + '</p>';

  // Replace placeholders with actual img tags (AFTER all processing)
  html = html.replace(/__IMG_PLACEHOLDER_(\d+)__/g, (match, index) => {
    const img = images[parseInt(index)];
    return `<img src="${img.url}" alt="${img.alt}" class="rounded-xl my-6 max-w-full border border-white/10" />`;
  });

  // Add YouTube video at the end if URL is provided
  if (youtubeUrl) {
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (videoId) {
      html += `<div class="relative w-full rounded-2xl overflow-hidden border border-white/10 my-6">
        <div class="relative pt-[56.25%]">
          <iframe
            src="https://www.youtube.com/embed/${videoId}"
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            class="absolute top-0 left-0 w-full h-full"
          />
        </div>
      </div>`;
    }
  }

  return html;
};

const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchPost = async () => {
      setLoading(true);
      setNotFound(false);
      setAccessDenied(false);

      try {
        const { data, error } = await supabase
          .from('blog_posts')
          .select('*, author:profiles!author_id(username)')
          .eq('slug', slug)
          .eq('status', 'published')
          .lte('published_at', new Date().toISOString())
          .maybeSingle();

        if (error) throw error;
        if (!data) { setNotFound(true); return; }

        const mapped: BlogPost = { ...data, author_username: (data as any).author?.username || 'Admin' };

        // Clearance check
        if (mapped.required_clearance_level > 0) {
          if (!user || user.clearance_level < mapped.required_clearance_level) {
            setAccessDenied(true);
            return;
          }
        }

        setPost(mapped);

        // Dynamic meta tags
        document.title = `${mapped.title} — Server Manfredonia`;
        const setMeta = (name: string, content: string) => {
          let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
          if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
          el.setAttribute('content', content);
        };
        const setOg = (prop: string, content: string) => {
          let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
          if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
          el.setAttribute('content', content);
        };
        setMeta('description', mapped.excerpt || mapped.title);
        setOg('og:title', mapped.title);
        setOg('og:description', mapped.excerpt || mapped.title);
        if (mapped.cover_image_url) setOg('og:image', mapped.cover_image_url);
        setOg('og:type', 'article');

        // Increment view count (fire and forget)
        supabase.from('blog_posts').update({ views: (mapped.views || 0) + 1 }).eq('id', mapped.id).then(() => { });

        // Fetch related posts
        if (mapped.tags?.length) {
          const { data: related } = await supabase
            .from('blog_posts')
            .select('id, title, slug, cover_image_url, excerpt, tags, published_at, is_featured, required_clearance_level, views, content, author_id, status, created_at, updated_at')
            .eq('status', 'published')
            .lte('published_at', new Date().toISOString())
            .neq('id', mapped.id)
            .contains('tags', mapped.tags.slice(0, 2))
            .limit(3);

          if (related) {
            setRelatedPosts(related.map((p: any) => ({
              ...p,
              author_username: 'Admin',
            })));
          }
        }
      } catch (err: any) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();

    return () => {
      document.title = 'Server Manfredonia';
    };
  }, [slug, user]);

  const wrapMobile = (content: React.ReactNode) =>
    isMobilePhone() ? (
      <MobilePageShell subtitle="Blog" activeNav="blog">{content}</MobilePageShell>
    ) : content;

  if (loading) {
    return wrapMobile(
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-8 animate-pulse">
        <div className="h-6 w-24 bg-white/5 rounded-full" />
        <div className="h-72 bg-white/5 rounded-2xl" />
        <div className="h-10 w-3/4 bg-white/5 rounded-xl" />
        <div className="h-4 w-full bg-white/5 rounded-xl" />
        <div className="h-4 w-5/6 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (notFound) {
    return wrapMobile(
      <div className="max-w-4xl mx-auto px-4 py-24 flex flex-col items-center gap-6 text-center">
        <span className="material-symbols-outlined text-7xl text-white/10">article</span>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white/30">Articolo non trovato</h1>
        <p className="text-white/20 text-sm">L'articolo che stai cercando non esiste o non è stato ancora pubblicato.</p>
        <Link to="/blog" className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Torna al Blog
        </Link>
      </div>
    );
  }

  if (accessDenied) {
    return wrapMobile(
      <div className="max-w-4xl mx-auto px-4 py-24 flex flex-col items-center gap-6 text-center">
        <div className="size-20 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-purple-400">lock</span>
        </div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white/60">Accesso Limitato</h1>
        <p className="text-white/30 text-sm max-w-sm leading-relaxed">
          Questo articolo richiede un livello di clearance più alto. Completa le missioni Intel per sbloccare l'accesso.
        </p>
        <Link to="/blog" className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          Torna al Blog
        </Link>
      </div>
    );
  }

  if (!post) return null;

  const readingTime = estimateReadingTime(post.content);

  return wrapMobile(
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-10"
    >
      {/* Back button */}
      <div>
        <button
          id="blog-back-btn"
          onClick={() => navigate('/blog')}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors group"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          Blog
        </button>
      </div>

      {/* Cover Image */}
      {post.cover_image_url && (
        <div className="relative w-full h-72 md:h-96 rounded-2xl overflow-hidden border border-white/10">
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>
      )}

      {/* Post header */}
      <header className="flex flex-col gap-5">
        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map(tag => (
              <Link
                key={tag}
                to={`/blog?tag=${tag}`}
                className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter text-white leading-none">
          {post.title}
        </h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-lg text-white/50 leading-relaxed">{post.excerpt}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[16px] text-white/40">person</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Author</span>
              <span className="text-xs font-bold text-white/60">{post.author_username}</span>
            </div>
          </div>

          <div className="h-6 w-px bg-white/10 hidden sm:block" />

          {post.published_at && (
            <div className="flex items-center gap-2 text-white/30">
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>
              <span className="text-xs font-mono">
                {new Date(post.published_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-white/30">
            <span className="material-symbols-outlined text-[16px]">schedule</span>
            <span className="text-xs font-mono">{readingTime} min di lettura</span>
          </div>

          {post.views > 0 && (
            <div className="flex items-center gap-2 text-white/20">
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              <span className="text-xs font-mono">{post.views} visualizzazioni</span>
            </div>
          )}

          {post.is_featured && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="material-symbols-outlined text-[14px] text-amber-400">star</span>
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Featured</span>
            </div>
          )}
        </div>
      </header>

      {/* Article body */}
      <div
        className="prose prose-invert max-w-none glass-card rounded-2xl p-8 border border-white/5"
        dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content, post.youtube_video_url) }}
      />

      {/* Related posts */}
      {relatedPosts.length > 0 && (
        <section className="flex flex-col gap-6 pt-4 border-t border-white/5">
          <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Articoli Correlati</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {relatedPosts.map(related => (
              <Link
                key={related.id}
                to={`/blog/${related.slug}`}
                className="group glass-card rounded-xl p-4 border border-white/5 hover:border-white/20 transition-all duration-200 flex flex-col gap-2"
              >
                {related.cover_image_url && (
                  <div className="h-28 rounded-lg overflow-hidden">
                    <img src={related.cover_image_url} alt={related.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                )}
                <h4 className="text-sm font-black uppercase tracking-tight text-white/70 group-hover:text-white transition-colors line-clamp-2">
                  {related.title}
                </h4>
                {related.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {related.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/30">{t}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

    </motion.article>
  );
};

export default BlogPostPage;
