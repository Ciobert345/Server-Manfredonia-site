-- ============================================================
-- MIGRATION: Aggiunta supporto video YouTube nel Blog
-- Progetto: Server Manfredonia
-- Applicare nel SQL editor di Supabase
-- ============================================================

-- Aggiungi campo youtube_video_url alla tabella blog_posts
alter table public.blog_posts
  add column if not exists youtube_video_url text;
