-- ============================================================
-- MIGRATION: Aggiunta sezione Blog
-- Progetto: Server Manfredonia
-- Applicare nel SQL editor di Supabase (in ordine)
-- ============================================================

-- 1. TABELLA PRINCIPALE: blog_posts
create table public.blog_posts (
  id                       uuid        primary key default gen_random_uuid(),
  author_id                uuid        references public.profiles(id) not null,
  title                    text        not null,
  slug                     text        not null unique,
  excerpt                  text,
  content                  text        not null default '',
  cover_image_url          text,
  status                   text        not null default 'draft',
  is_featured              bool        not null default false,
  required_clearance_level int4        default 0,
  tags                     text[]      default '{}'::text[],
  views                    int4        not null default 0,
  published_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- 2. TABELLA IMMAGINI INLINE
create table public.blog_post_images (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        references public.blog_posts(id) on delete cascade not null,
  image_url  text        not null,
  caption    text,
  position   int4        default 0,
  created_at timestamptz not null default now()
);

-- 3. ESTENSIONE global_config
alter table public.global_config
  add column if not exists blog_enabled   bool  default false,
  add column if not exists blog_title     text  default 'Blog',
  add column if not exists blog_subtitle  text  default 'News e aggiornamenti dalla community';

-- 4. TRIGGER updated_at
create or replace function public.handle_blog_post_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_blog_post_update
  before update on public.blog_posts
  for each row execute function public.handle_blog_post_updated_at();

-- 5. RLS blog_posts
alter table public.blog_posts enable row level security;

create policy "Public can read published posts"
  on public.blog_posts for select
  using (status = 'published' and published_at <= now());

create policy "Admins manage blog posts"
  on public.blog_posts for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  ));

-- 6. RLS blog_post_images
alter table public.blog_post_images enable row level security;

create policy "Public can read images of published posts"
  on public.blog_post_images for select
  using (exists (
    select 1 from public.blog_posts
    where blog_posts.id = blog_post_images.post_id
      and blog_posts.status = 'published'
      and blog_posts.published_at <= now()
  ));

create policy "Admins manage blog images"
  on public.blog_post_images for all
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  ));

-- 7. INDICI
create index if not exists idx_blog_posts_status_published_at on public.blog_posts (status, published_at desc);
create index if not exists idx_blog_posts_slug on public.blog_posts (slug);
create index if not exists idx_blog_posts_author_id on public.blog_posts (author_id);
create index if not exists idx_blog_posts_tags on public.blog_posts using gin (tags);
