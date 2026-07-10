
import React from 'react';
import { Link } from 'react-router-dom';
import { BlogPost } from '../types';

interface BlogPostCardProps {
  post: BlogPost;
}

const estimateReadingTime = (content: string): number => {
  const wordsPerMinute = 200;
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const BlogPostCard: React.FC<BlogPostCardProps> = ({ post }) => {
  const readingTime = estimateReadingTime(post.content);

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group relative flex flex-col glass-card rounded-2xl overflow-hidden border border-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
    >
      {/* Cover Image */}
      <div className="relative w-full h-48 bg-white/5 overflow-hidden shrink-0">
        {post.cover_image_url ? (
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
            <span className="material-symbols-outlined text-6xl text-white/10">article</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Featured badge */}
        {post.is_featured && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm">
            <span className="material-symbols-outlined text-[14px] text-amber-400">star</span>
            <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Featured</span>
          </div>
        )}

        {/* Clearance badge */}
        {post.required_clearance_level > 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 backdrop-blur-sm">
            <span className="material-symbols-outlined text-[14px] text-purple-400">lock</span>
            <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest">LVL {post.required_clearance_level}+</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40"
              >
                {tag}
              </span>
            ))}
            {post.tags.length > 3 && (
              <span className="text-[9px] font-bold text-white/20">+{post.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Title */}
        <h2 className="text-lg font-black uppercase tracking-tight leading-snug text-white group-hover:text-white transition-colors line-clamp-2">
          {post.title}
        </h2>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm text-white/50 leading-relaxed line-clamp-3 flex-1">
            {post.excerpt}
          </p>
        )}

        {/* Meta footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-white/30">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">{readingTime} min</span>
            </div>
            {post.views > 0 && (
              <div className="flex items-center gap-1.5 text-white/20">
                <span className="material-symbols-outlined text-[14px]">visibility</span>
                <span className="text-[10px] font-mono">{post.views}</span>
              </div>
            )}
          </div>
          <span className="text-[10px] font-mono text-white/20">
            {formatDate(post.published_at || post.created_at)}
          </span>
        </div>
      </div>

      {/* Hover arrow indicator */}
      <div className="absolute bottom-5 right-5 size-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5">
        <span className="material-symbols-outlined text-sm text-white/60">arrow_forward</span>
      </div>
    </Link>
  );
};

export default BlogPostCard;
