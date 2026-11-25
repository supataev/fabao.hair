-- Fabao: blog, picture-only carousel slides, carousel settings.
--
-- NOT RUN YET. Run once in Supabase → SQL Editor (project psvnemuqvokrzmijwnbp):
-- New query → paste the WHOLE file → Cmd+A → Run. If asked about RLS, choose
-- «Run and enable RLS». Safe to run twice. Check afterwards:
--   select (select count(*) from information_schema.tables where table_schema='public' and table_name='posts') as posts,
--          (select count(*) from information_schema.columns where table_schema='public' and table_name='promos' and column_name='post_id') as promo_post_link;
-- Both should be 1.
--
-- 1. posts: blog stories (ru + ky), cover photo, tags, optional brand.
-- 2. promos: theme 'image' (picture only, full width), image_position (crop
--    focus), post_id (a slide that promotes a blog story).
-- 3. site_settings: carousel_autoplay ('on' / 'off'), carousel_interval (seconds).
-- 4. One starter story, written from Fabao's product notes.

begin;

-- 1. Blog ----------------------------------------------------------------------
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_ru     text not null,
  title_ky     text,
  excerpt_ru   text,
  excerpt_ky   text,
  body_ru      text,          -- paragraphs separated by an empty line; «## » headings, «- » lists, **bold**
  body_ky      text,
  cover_url    text,
  tags         text[] not null default '{}',
  brand_id     uuid references public.brands(id) on delete set null,
  published_on date not null default current_date,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.posts enable row level security;
grant select on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;

drop policy if exists "public reads published posts" on public.posts;
create policy "public reads published posts" on public.posts
  for select to anon, authenticated using (is_published or public.is_staff());
drop policy if exists "staff writes posts" on public.posts;
create policy "staff writes posts" on public.posts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 2. Slides ---------------------------------------------------------------------
alter table public.promos
  add column if not exists image_position text not null default 'center'
    check (image_position in ('center', 'top', 'bottom', 'left', 'right')),
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

alter table public.promos drop constraint if exists promos_theme_check;
alter table public.promos add constraint promos_theme_check
  check (theme in ('image', 'emerald', 'ivory', 'gold', 'brand'));

-- 3. Carousel settings ------------------------------------------------------------
insert into public.site_settings (key, value_ru, value_ky)
select v.key, v.val, v.val
  from (values ('carousel_autoplay', 'on'), ('carousel_interval', '6')) as v(key, val)
 where not exists (select 1 from public.site_settings s where s.key = v.key);

-- 4. Starter story ----------------------------------------------------------------
insert into public.posts (slug, title_ru, title_ky, excerpt_ru, excerpt_ky, body_ru, body_ky, cover_url, tags, brand_id)
select 'kak-vybrat-tonik-101',
  'Тоник 101B, 101G или 101F: какой выбрать',
  '101B, 101G же 101F тоники: кайсынысын тандоо керек',
  'Три тоника ZhangGuang 101 решают разные задачи. Коротко о том, чем они отличаются и с чего начать.',
  'ZhangGuang 101дин үч тоники ар башка маселелерди чечет. Алардын айырмасы жана эмнеден баштоо керек — кыскача.',
  'Тоники ZhangGuang 101 — основа ухода против выпадения волос. Их три, и каждый подбирают под свой случай.

## 101B — когда волосы активно выпадают
Самый известный тоник линии. Женьшень, софора японская и дудник вместе с салициловой кислотой мягко очищают кожу головы и укрепляют корни.

## 101G — когда кожа головы жирная
Сдерживает избыточную работу сальных желёз и очищает фолликулы от кожного сала. При сильной жирности его часто сочетают с 101B.

## 101F — при давнем выпадении
Самая сильная формула линии: для длительного, в том числе наследственного выпадения у мужчин и женщин. Наносят по 5 мл на кожу головы дважды в день с массажем.

## С чего начать
- Опишите нам проблему в WhatsApp — консультант подскажет тоник и схему курса.
- Тоник работает лучше вместе с подходящим шампунем ZhangGuang 101.
- Курс — это регулярность: важно не пропускать дни.

**Важно:** при сильном или внезапном выпадении волос сначала обратитесь к врачу-трихологу.',
  'ZhangGuang 101 тониктери — чач түшүүгө каршы кам көрүүнүн негизи. Алар үчөө жана ар бири өз учуруна жараша тандалат.

## 101B — чач катуу түшкөндө
Линиянын эң белгилүү тоники. Женьшень, жапон софорасы жана дудник салицил кислотасы менен бирге баш терисин жумшак тазалап, тамырды бекемдейт.

## 101G — баш териси майлуу болгондо
Май бездеринин ашыкча иштешин азайтып, фолликулдарды майдан тазалайт. Баш териси өтө майлуу болсо, көбүнчө 101B менен бирге колдонулат.

## 101F — узакка созулган чач түшүүдө
Линиянын эң күчтүү формуласы: эркектер жана аялдардагы узакка созулган, анын ичинде тукум куучулук чач түшүү үчүн. Баш терисине күнүнө эки жолу 5 мл массаж менен сүйкөлөт.

## Эмнеден баштоо керек
- Көйгөйүңүздү WhatsAppка жазыңыз — кеңешчи тоникти жана курсту сунуштайт.
- Тоник ылайыктуу ZhangGuang 101 шампуну менен жакшыраак иштейт.
- Курс — бул туруктуулук: күндөрдү калтырбоо маанилүү.

**Маанилүү:** чач катуу же күтүлбөгөн жерден түшсө, адегенде дарыгер-трихологго кайрылыңыз.',
  '/assets/img/products/tonic-101f.jpg',
  array['советы', 'ZhangGuang 101'],
  (select id from public.brands where slug = 'zhangguang-101')
 where not exists (select 1 from public.posts where slug = 'kak-vybrat-tonik-101');

-- 5. First slide: picture only (AI-generated campaign photo, labelled in its metadata).
--    The title is not shown; it is the picture's description for screen readers.
insert into public.promos (sort_order, theme, image_position, title_ru, title_ky, link, image_url)
select 0, 'image', 'center',
  'Две девушки с красивыми волосами держат тоник ZhangGuang 101B',
  'Сулуу чачтуу эки кыз ZhangGuang 101B тоникин кармап турушат',
  '/products/?q=101B', '/assets/img/promos/hero-101b.jpg'
 where not exists (select 1 from public.promos where image_url = '/assets/img/promos/hero-101b.jpg');

commit;
