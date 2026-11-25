-- Fabao site structure v2: brand pages, promo slider, cart statistics, popularity.
--
-- NOT RUN YET. Run once in Supabase → SQL Editor after Eldar approves.
-- Safe to run twice. Run it BEFORE the new site version goes live.
-- If Supabase warns about Row Level Security, choose «Run and enable RLS»:
-- every table here already has RLS on (the new promos table enables it below).
--
-- 1. brands: fields for the brand page (tagline, story, key features, accent
--    colour, cover photo), pre-filled for ZhangGuang 101, Charismo, Follicell.
-- 2. promos: slides for the carousel under the menu (sales, news, events),
--    managed in admin → «Акции». Seeded with 4 slides, no invented discounts.
-- 3. site_events: product_id / brand_id columns and new events (add to cart,
--    checkout, brand page view, slide click, search).
-- 4. catalog_popularity(): engagement score per product and brand, readable
--    by the public site (counts only, nothing personal). Used to pick the
--    "popular" products and brands on the home page.

begin;

-- 1. Brand pages ------------------------------------------------------------
alter table public.brands
  add column if not exists tagline_ru   text,
  add column if not exists tagline_ky   text,
  add column if not exists story_ru     text,
  add column if not exists story_ky     text,
  add column if not exists features_ru  text,   -- one per line: «Заголовок — текст»
  add column if not exists features_ky  text,
  add column if not exists accent_color text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists cover_url    text;

update public.brands set
  accent_color = coalesce(accent_color, '#0C5642'),
  tagline_ru = coalesce(tagline_ru, 'Китайская травяная формула против выпадения волос — с 1974 года'),
  tagline_ky = coalesce(tagline_ky, 'Чач түшүүгө каршы кытай чөп формуласы — 1974-жылдан бери'),
  story_ru = coalesce(story_ru, 'ZhangGuang 101 — один из самых известных в Китае брендов ухода против выпадения волос. Линия выросла из традиционной китайской фитотерапии: в основе тоников 101 — экстракты женьшеня, дудника, шалфея, софоры и других растений.

Тоники подбирают под тип выпадения: 101B — при активном выпадении, 101G — при жирной коже головы, 101F — при давнем, в том числе наследственном выпадении. Шампуни и кондиционер готовят кожу головы и усиливают действие тоника.

Fabao — официальный дистрибьютор ZhangGuang 101 в Кыргызстане: только оригинальная продукция с документами.'),
  story_ky = coalesce(story_ky, 'ZhangGuang 101 — Кытайдагы чач түшүүгө каршы эң белгилүү бренддердин бири. Линия салттуу кытай фитотерапиясынан чыккан: 101 тониктеринин негизинде женьшень, дудник, шалфей, софора жана башка өсүмдүктөрдүн экстракттары.

Тониктер чач түшүүнүн түрүнө жараша тандалат: 101B — чач катуу түшкөндө, 101G — баш териси майлуу болгондо, 101F — узакка созулган, анын ичинде тукум куучулук чач түшүүдө. Шампундар жана кондиционер баш терисин даярдап, тониктин таасирин күчөтөт.

Fabao — ZhangGuang 101дин Кыргызстандагы расмий дистрибьютору: документтери бар оригиналдуу продукция гана.'),
  features_ru = coalesce(features_ru, 'С 1974 года — один из самых известных брендов против выпадения волос в Китае
Растительные формулы — женьшень, дудник, шалфей, софора и другие травы
Подбор под тип выпадения — тоники 101B, 101G и 101F для разных случаев
Лабораторные тесты — эффективность шампуня и кондиционера подтверждена в лаборатории (по данным производителя)'),
  features_ky = coalesce(features_ky, '1974-жылдан бери — Кытайдагы чач түшүүгө каршы эң белгилүү бренддердин бири
Өсүмдүк формулалары — женьшень, дудник, шалфей, софора жана башка чөптөр
Чач түшүүнүн түрүнө жараша — ар кандай учурлар үчүн 101B, 101G жана 101F тониктери
Лабораториялык сыноолор — шампундун жана кондиционердин натыйжалуулугу лабораторияда тастыкталган (өндүрүүчүнүн маалыматы боюнча)')
where slug = 'zhangguang-101';

update public.brands set
  accent_color = coalesce(accent_color, '#167FCB'),
  tagline_ru = coalesce(tagline_ru, 'Американская сыворотка DekoHair для роста и густоты волос — без миноксидила'),
  tagline_ky = coalesce(tagline_ky, 'Чачтын өсүшү жана калыңдыгы үчүн америкалык DekoHair сывороткасы — миноксидилсиз'),
  story_ru = coalesce(story_ru, 'Charismo — американская компания (Техас, США), которая создаёт уход для кожи головы и волос. Её главный продукт — сыворотка DekoHair против выпадения и истончения волос.

DekoHair работает без миноксидила: по данным производителя, в её основе — биотинил-трипептид-1, апигенин и олеаноловая кислота. Сыворотку наносят на кожу головы ежедневно; одного флакона 60 мл хватает примерно на месяц.

Fabao — официальный дистрибьютор Charismo в Кыргызстане.'),
  story_ky = coalesce(story_ky, 'Charismo — баш териси жана чач үчүн каражаттарды чыгарган америкалык компания (Техас, АКШ). Анын негизги продукту — чач түшүүгө жана суюлууга каршы DekoHair сывороткасы.

DekoHair миноксидилсиз иштейт: өндүрүүчүнүн маалыматы боюнча, анын негизинде биотинил-трипептид-1, апигенин жана олеанол кислотасы. Сыворотка баш терисине күн сайын сүйкөлөт; 60 мл бир флакон болжол менен бир айга жетет.

Fabao — Charismo брендинин Кыргызстандагы расмий дистрибьютору.'),
  features_ru = coalesce(features_ru, 'Сделано в США — разработка и производство Charismo, Техас
Без миноксидила — мягкая формула для ежедневного применения
Пептиды и растительные активы — биотинил-трипептид-1, апигенин, олеаноловая кислота (по данным производителя)
Месячный курс — флакона 60 мл хватает примерно на месяц'),
  features_ky = coalesce(features_ky, 'АКШда жасалган — Charismo компаниясынын иштеп чыгуусу, Техас
Миноксидилсиз — күн сайын колдонууга жумшак формула
Пептиддер жана өсүмдүк активдери — биотинил-трипептид-1, апигенин, олеанол кислотасы (өндүрүүчүнүн маалыматы боюнча)
Бир айлык курс — 60 мл флакон болжол менен бир айга жетет')
where slug = 'dekohair';

update public.brands set
  accent_color = coalesce(accent_color, '#E05B32'),
  tagline_ru = coalesce(tagline_ru, 'Российский пептидный комплекс для восстановления волосяных фолликулов'),
  tagline_ky = coalesce(tagline_ky, 'Чач фолликулдарын калыбына келтирүү үчүн орусиялык пептиддик комплекс'),
  story_ru = coalesce(story_ru, 'Фоллицель (Follicell) — российский бренд ухода против выпадения волос, который рекомендуют трихологи и косметологи. В основе линии — пептиды: молекулы, которые помогают фолликулам вернуться к нормальному росту.

Пептидный коктейль объединяет четыре известных комплекса против выпадения — Procapil, Capixyl, Follicusan и Auxin. Регенерирующая маска с пептидами, гидролизованным кератином и клевером возвращает волосам блеск и плотность без утяжеления.

Fabao — официальный дистрибьютор Фоллицель в Кыргызстане.'),
  story_ky = coalesce(story_ky, 'Фоллицель (Follicell) — трихологдор жана косметологдор сунуштаган, чач түшүүгө каршы орусиялык бренд. Линиянын негизинде пептиддер: фолликулдарга кадимки өсүүгө кайтууга жардам берген молекулалар.

Пептиддик коктейль чач түшүүгө каршы төрт белгилүү комплексти бириктирет — Procapil, Capixyl, Follicusan жана Auxin. Пептиддер, гидролизденген кератин жана беде кошулган калыбына келтирүүчү маска чачка жылтыр жана калыңдык берет, оордотпойт.

Fabao — Фоллицелдин Кыргызстандагы расмий дистрибьютору.'),
  features_ru = coalesce(features_ru, 'Четыре пептидных комплекса — Procapil, Capixyl, Follicusan и Auxin в одном средстве
Рекомендуют трихологи — используется в салонах и трихологических кабинетах
Сделано в России — производство под маркой Фоллицель
Комплексный уход — коктейль для кожи головы и маска для длины волос'),
  features_ky = coalesce(features_ky, 'Төрт пептиддик комплекс — Procapil, Capixyl, Follicusan жана Auxin бир каражатта
Трихологдор сунуштайт — салондордо жана трихология кабинеттеринде колдонулат
Орусияда жасалган — Фоллицель маркасы менен өндүрүлөт
Комплекстүү кам көрүү — баш териси үчүн коктейль жана чачтын узундугу үчүн маска')
where slug = 'follicell';

-- 2. Promo slides -------------------------------------------------------------
create table if not exists public.promos (
  id           uuid primary key default gen_random_uuid(),
  title_ru     text not null,
  title_ky     text,
  text_ru      text,
  text_ky      text,
  cta_ru       text,
  cta_ky       text,
  link         text,          -- '/products/?brand=…', '/brands/…/', 'whatsapp' or https://…
  image_url    text,
  theme        text not null default 'emerald' check (theme in ('emerald', 'ivory', 'gold', 'brand')),
  brand_id     uuid references public.brands(id) on delete set null,  -- for theme 'brand'
  starts_on    date,
  ends_on      date,
  is_published boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.promos enable row level security;
grant select on public.promos to anon;
grant select, insert, update, delete on public.promos to authenticated;

drop policy if exists "public reads published promos" on public.promos;
create policy "public reads published promos" on public.promos
  for select to anon, authenticated using (is_published or public.is_staff());
drop policy if exists "staff writes promos" on public.promos;
create policy "staff writes promos" on public.promos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into public.promos (sort_order, theme, title_ru, title_ky, text_ru, text_ky, cta_ru, cta_ky, link, image_url, brand_id)
select v.sort_order, v.theme, v.title_ru, v.title_ky, v.text_ru, v.text_ky, v.cta_ru, v.cta_ky, v.link, v.image_url,
       (select id from public.brands where slug = v.brand_slug)
  from (values
    (1, 'brand', 'Новые шампуни ZhangGuang 101', 'ZhangGuang 101дин жаңы шампундары',
     'Укрепляющий, себорегулирующий, «9 трав», для окрашенных волос и кондиционер с травами — уже в Fabao.',
     'Бекемдөөчү, себорегулятордук, «9 чөп», боёлгон чач үчүн жана чөптүү кондиционер — Fabao дүкөнүндө.',
     'Смотреть новинки', 'Жаңылыктарды көрүү', '/products/?brand=zhangguang-101', '/assets/img/products/thickening-shampoo.jpg', 'zhangguang-101'),
    (2, 'emerald', 'Бесплатная консультация по уходу', 'Кам көрүү боюнча акысыз кеңеш',
     'Расскажите о проблеме в WhatsApp — подберём средства и объясним, как проходить курс.',
     'WhatsAppка көйгөйүңүздү жазыңыз — каражаттарды тандап, курсту кантип өтүүнү түшүндүрөбүз.',
     'Написать в WhatsApp', 'WhatsAppка жазуу', 'whatsapp', '/assets/img/products/tonic-101f.jpg', null),
    (3, 'ivory', 'Доставка по всему Кыргызстану', 'Кыргызстандын баардык аймагына жеткирүү',
     'По Бишкеку — курьером, в регионы — службой доставки. Оформите заказ в корзине за минуту.',
     'Бишкек боюнча — курьер менен, аймактарга — жеткирүү кызматы менен. Буйрутманы себетте бир мүнөттө тариздеңиз.',
     'Перейти в каталог', 'Каталогго өтүү', '/products/', '/assets/img/products/ginseng-shampoo.jpg', null),
    (4, 'gold', 'Оптом для салонов и магазинов', 'Салондор жана дүкөндөр үчүн дүң',
     'Работаем с салонами красоты, барбершопами, магазинами косметики и реселлерами.',
     'Сулуулук салондору, барбершоптор, косметика дүкөндөрү жана реселлерлер менен иштейбиз.',
     'Стать партнёром', 'Өнөктөш болуу', '/#wholesale', null, null)
  ) as v(sort_order, theme, title_ru, title_ky, text_ru, text_ky, cta_ru, cta_ky, link, image_url, brand_slug)
 where not exists (select 1 from public.promos p where p.title_ru = v.title_ru);

-- 3. Statistics: new events and product / brand ids ---------------------------
alter table public.site_events
  add column if not exists product_id uuid,
  add column if not exists brand_id   uuid;

alter table public.site_events drop constraint if exists site_events_event_check;
alter table public.site_events add constraint site_events_event_check
  check (event in ('pageview', 'consult', 'order', 'wholesale', 'instagram', 'product_open',
                   'add_to_cart', 'checkout', 'brand_view', 'promo_click', 'search'));

-- 4. Popularity (public: counts only) ----------------------------------------
create or replace function public.catalog_popularity(days int default 60)
returns table (product_id uuid, brand_id uuid, score bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.product_id, e.brand_id,
         sum(case e.event
               when 'checkout'     then 8
               when 'add_to_cart'  then 5
               when 'order'        then 5
               when 'product_open' then 1
               when 'brand_view'   then 1
               else 0 end)::bigint as score
    from public.site_events e
   where e.created_at >= now() - make_interval(days => least(greatest(days, 1), 365))
     and (e.product_id is not null or e.brand_id is not null)
   group by e.product_id, e.brand_id;
$$;
grant execute on function public.catalog_popularity(int) to anon, authenticated;

commit;
