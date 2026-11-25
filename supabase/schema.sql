-- FABAO website database
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again: every statement checks whether the object already exists.

-- ---------------------------------------------------------------------------
-- Staff allow-list. Only e-mails listed here can edit the site, even if
-- someone manages to create an account.
-- ---------------------------------------------------------------------------
create table if not exists public.staff (
  email      text primary key,
  name       text,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table if not exists public.brands (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  country_ru     text,
  country_ky     text,
  description_ru text,
  description_ky text,
  sort_order     int  not null default 0,
  is_published   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid references public.brands(id) on delete set null,
  name_ru        text not null,
  name_ky        text,
  category       text,            -- e.g. 'shampoo', 'tonic', 'mask', 'serum', 'care'
  volume         text,            -- e.g. '120 мл'
  price_kgs      numeric(10,2),   -- retail price; empty = "price on request"
  description_ru text,
  description_ky text,
  usage_ru       text,
  usage_ky       text,
  image_url      text,
  in_stock       boolean not null default true,
  is_published   boolean not null default true,
  is_featured    boolean not null default false,
  sort_order     int     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists products_brand_idx on public.products(brand_id);

-- ---------------------------------------------------------------------------
-- Editable site texts (hero, about, delivery, wholesale, contacts ...)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value_ru   text,
  value_ky   text,
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.site_settings;
create trigger settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: the public can only READ published rows,
-- only staff can write.
-- ---------------------------------------------------------------------------
alter table public.staff         enable row level security;
alter table public.brands        enable row level security;
alter table public.products      enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "staff can see staff list" on public.staff;
create policy "staff can see staff list" on public.staff
  for select using (public.is_staff());

drop policy if exists "public reads published brands" on public.brands;
create policy "public reads published brands" on public.brands
  for select using (is_published or public.is_staff());
drop policy if exists "staff writes brands" on public.brands;
create policy "staff writes brands" on public.brands
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public reads published products" on public.products;
create policy "public reads published products" on public.products
  for select using (is_published or public.is_staff());
drop policy if exists "staff writes products" on public.products;
create policy "staff writes products" on public.products
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public reads settings" on public.site_settings;
create policy "public reads settings" on public.site_settings
  for select using (true);
drop policy if exists "staff writes settings" on public.site_settings;
create policy "staff writes settings" on public.site_settings
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Photo storage: public bucket for reading, staff-only uploads.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public reads product images" on storage.objects;
create policy "public reads product images" on storage.objects
  for select using (bucket_id = 'product-images');
drop policy if exists "staff uploads product images" on storage.objects;
create policy "staff uploads product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_staff());
drop policy if exists "staff updates product images" on storage.objects;
create policy "staff updates product images" on storage.objects
  for update using (bucket_id = 'product-images' and public.is_staff());
drop policy if exists "staff deletes product images" on storage.objects;
create policy "staff deletes product images" on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_staff());

-- ---------------------------------------------------------------------------
-- Starter content. Edit or delete it from fabao.hair/admin afterwards.
-- ---------------------------------------------------------------------------
insert into public.brands (slug, name, country_ru, country_ky, description_ru, description_ky, sort_order) values
  ('zhangguang-101', 'ZhangGuang 101', 'Китай', 'Кытай',
   'Легендарная линия против выпадения волос на растительных экстрактах. Знаменитый тоник 101B, шампуни и уход для кожи головы.',
   'Чачтын түшүшүнө каршы өсүмдүк экстракттарына негизделген атактуу линия. Белгилүү 101B тоники, шампундар жана баш терисине кам көрүү.', 1),
  ('dekohair', 'DekoHair', 'США', 'АКШ',
   'Профессиональный уход из США для укрепления и роста волос.',
   'Чачты бекемдөө жана өстүрүү үчүн АКШдан келген профессионалдык кам көрүү.', 2),
  ('follicell', 'Follicell', 'Россия', 'Россия',
   'Пептидные комплексы для восстановления волосяных фолликулов.',
   'Чач фолликулдарын калыбына келтирүү үчүн пептиддик комплекстер.', 3)
on conflict (slug) do nothing;

insert into public.products (brand_id, name_ru, name_ky, category, volume, description_ru, description_ky, is_featured, sort_order)
select b.id, v.name_ru, v.name_ky, v.category, v.volume, v.description_ru, v.description_ky, v.featured, v.sort_order
from (values
  ('zhangguang-101', 'Тоник 101B от выпадения волос', '101B тоники, чач түшүүгө каршы', 'tonic', '120 мл',
   'Легенда ZhangGuang с обновлённой формулой: женьшень, софора японская и дудник плюс салициловая кислота для мягкого очищения и глубокого проникновения. Останавливает выпадение, укрепляет корни, контролирует жирность кожи головы.',
   'Жаңыланган формуласы бар ZhangGuang легендасы: женьшень, жапон софорасы жана дудник, ошондой эле жумшак тазалоо үчүн салицил кислотасы. Чачтын түшүүсүн токтотуп, тамырын бекемдейт, баш терисинин майлуулугун көзөмөлдөйт.',
   true, 1),
  ('zhangguang-101', 'Женьшеневый шампунь', 'Женьшень шампуну', 'shampoo', null,
   'Готовит кожу головы и усиливает действие тоника. Деликатное очищение с питанием фолликулов.',
   'Баш терисин даярдап, тониктин таасирин күчөтөт. Фолликулдарды азыктандыруу менен назик тазалоо.',
   false, 2),
  ('follicell', 'Регенерирующая маска', 'Калыбына келтирүүчү маска', 'mask', null,
   'Пептиды, гидролизованный кератин и клевер — блеск и плотность без утяжеления. Можно использовать вместо кондиционера.',
   'Пептиддер, гидролизденген кератин жана беде — оордотпостон жалтырак жана калыңдык. Кондиционердин ордуна колдонсо болот.',
   false, 3),
  ('follicell', 'Пептидный коктейль', 'Пептиддик коктейль', 'serum', null,
   'Procapil, Capixyl, Follicusan и Auxin — четыре комплекса против выпадения волос. Без синдрома отмены.',
   'Procapil, Capixyl, Follicusan жана Auxin — чачтын түшүүсүнө каршы төрт комплекс. Токтоткондон кийин кайра түшпөйт.',
   true, 4)
) as v(brand_slug, name_ru, name_ky, category, volume, description_ru, description_ky, featured, sort_order)
join public.brands b on b.slug = v.brand_slug
where not exists (select 1 from public.products);

insert into public.site_settings (key, value_ru, value_ky) values
  ('hero_title',    'Оригинальный уход против выпадения волос', 'Чачтын түшүшүнө каршы оригиналдуу кам көрүү'),
  ('hero_subtitle', 'Официальный дистрибьютор ZhangGuang 101, DekoHair и Follicell в Кыргызстане. Консультация, подбор и доставка по Бишкеку и регионам.',
                    'Кыргызстандагы ZhangGuang 101, DekoHair жана Follicell брендеринин расмий дистрибьютору. Консультация, тандоо жана Бишкек менен аймактарга жеткирүү.'),
  ('about_text',    'Fabao работает напрямую с производителями, поэтому каждый флакон — оригинал с официальной гарантией. Мы помогаем подобрать уход и сопровождаем курс.',
                    'Fabao өндүрүүчүлөр менен түз иштейт, ошондуктан ар бир флакон — расмий кепилдиги бар оригинал. Биз кам көрүүнү тандоого жардам берип, курсту коштоп турабыз.'),
  ('delivery_text', 'Доставка по Бишкеку курьерами Яндекс. По Кыргызстану отправляем через Ылдам Экспресс.',
                    'Бишкек боюнча Яндекс курьерлери менен жеткиребиз. Кыргызстан боюнча Ылдам Экспресс аркылуу жөнөтөбүз.'),
  ('wholesale_text','Работаем с салонами красоты, магазинами косметики и реселлерами. Оптовые цены, сертификаты и маркетинговая поддержка.',
                    'Сулуулук салондору, косметика дүкөндөрү жана реселлерлер менен иштейбиз. Дүң баалар, сертификаттар жана маркетингдик колдоо.'),
  ('address',       'Бишкек', 'Бишкек'),
  ('hours',         '', ''),
  ('whatsapp',      '996505017013', '996505017013'),
  ('instagram',     'fabao_kg', 'fabao_kg')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- ADD STAFF: replace the e-mail below and run this line for each person.
-- (Also create the user in Authentication -> Users -> Add user.)
-- ---------------------------------------------------------------------------
-- insert into public.staff (email, name) values ('someone@example.com', 'Name');
