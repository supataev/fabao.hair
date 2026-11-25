-- Fabao hardening: protect site statistics from fake events; consistent brand name.
--
-- NOT RUN YET. Run once in Supabase → SQL Editor (project psvnemuqvokrzmijwnbp):
-- New query → paste the WHOLE file → Cmd+A → Run. Safe to run twice.
-- The file tests itself at the end; if the test fails, NOTHING is changed
-- (the whole file is one transaction). Expect the notice «self-test ok».
--
-- Before: anyone could insert any number of events, e.g. fake 'checkout' or
-- 'add_to_cart' rows for one product, which reordered «Популярное» through
-- catalog_popularity() and skewed «Статистика».
--
-- After:
-- 1. product_id / brand_id must point at real products / brands (new rows);
--    'checkout' rows carry no product.
-- 2. The browser may only fill the event fields (event, lang, label,
--    referrer_host, device, product_id, brand_id): not the time, not anything else.
-- 3. Each row gets `visitor`: a hash of IP + browser with a secret salt that
--    changes every day (no cookies; the IP itself is never stored; the salt is
--    deleted after 2 days, so visitors can't be traced or linked across days).
-- 4. Per visitor: at most 60 events per minute and 600 per day; popularity
--    events (add_to_cart, order, checkout, product_open, brand_view) count once
--    per visitor, product / brand and day. Extra rows are silently dropped.

begin;

-- secret daily salts: no policies, so the public API can never read them
create table if not exists public.analytics_salts (
  day  date primary key,
  salt bytea not null
);
alter table public.analytics_salts enable row level security;
revoke all on public.analytics_salts from anon, authenticated;

alter table public.site_events add column if not exists visitor text;
create index if not exists site_events_visitor_idx on public.site_events (visitor, created_at desc);

-- 1. only real products / brands; checkout has no product (checked for new rows)
alter table public.site_events drop constraint if exists site_events_product_fk;
alter table public.site_events add constraint site_events_product_fk
  foreign key (product_id) references public.products(id) on delete set null not valid;
alter table public.site_events drop constraint if exists site_events_brand_fk;
alter table public.site_events add constraint site_events_brand_fk
  foreign key (brand_id) references public.brands(id) on delete set null not valid;
alter table public.site_events drop constraint if exists site_events_checkout_no_product;
alter table public.site_events add constraint site_events_checkout_no_product
  check (event <> 'checkout' or product_id is null) not valid;

-- 2. the browser fills only these columns
revoke insert on public.site_events from anon, authenticated;
grant insert (event, lang, label, referrer_host, device, product_id, brand_id) on public.site_events to anon, authenticated;

-- 3 + 4. visitor hash, rate limit, one count per visitor / product / day
create or replace function public.site_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  headers json := nullif(current_setting('request.headers', true), '')::json;
  ip text;
  salt_today bytea;
begin
  new.created_at := now();
  if headers is null then
    return new;  -- not from the website (SQL editor, server jobs): no limits
  end if;
  ip := trim(coalesce(headers->>'cf-connecting-ip', split_part(headers->>'x-forwarded-for', ',', 1), headers->>'x-real-ip', ''));
  if ip = '' then
    return new;
  end if;

  select salt into salt_today from public.analytics_salts where day = current_date;
  if salt_today is null then
    insert into public.analytics_salts (day, salt) values (current_date, gen_random_bytes(16)) on conflict (day) do nothing;
    select salt into salt_today from public.analytics_salts where day = current_date;
    delete from public.analytics_salts where day < current_date - 2;
  end if;
  new.visitor := left(encode(digest(salt_today || convert_to(ip || '|' || coalesce(headers->>'user-agent', ''), 'UTF8'), 'sha256'), 'hex'), 32);

  -- flood limits (silently drop: the API still answers 201)
  if (select count(*) from public.site_events where visitor = new.visitor and created_at > now() - interval '1 minute') >= 60 then
    return null;
  end if;
  if (select count(*) from public.site_events where visitor = new.visitor and created_at > now() - interval '1 day') >= 600 then
    return null;
  end if;

  -- popularity events: once per visitor, event, product / brand and day
  if new.event in ('add_to_cart', 'order', 'checkout', 'product_open', 'brand_view') and exists (
    select 1 from public.site_events e
     where e.visitor = new.visitor and e.event = new.event
       and e.product_id is not distinct from new.product_id
       and e.brand_id is not distinct from new.brand_id
       and e.created_at >= date_trunc('day', now())
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists site_events_guard on public.site_events;
create trigger site_events_guard before insert on public.site_events
  for each row execute function public.site_events_guard();

-- 5. brand naming: the home intro says «DekoHair» (a product) where the brand
--    is meant; the brand is «Charismo» everywhere else on the site.
update public.site_settings
   set value_ru = replace(value_ru, 'ZhangGuang 101, DekoHair и Follicell', 'ZhangGuang 101, Charismo и Follicell'),
       value_ky = replace(value_ky, 'ZhangGuang 101, DekoHair жана Follicell', 'ZhangGuang 101, Charismo жана Follicell'),
       updated_at = now()
 where key = 'hero_subtitle';

-- self-test: pretend to be one website visitor (a documentation-only IP),
-- send a duplicate and a flood, check what was kept, then remove the test rows
do $$
declare
  kept int;
  dup int;
  p uuid := (select id from public.products order by sort_order limit 1);
begin
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.77", "user-agent": "fabao-selftest"}', true);
  insert into public.site_events (event, lang, label, product_id) values ('add_to_cart', 'ru', 'fabao-selftest', p);
  insert into public.site_events (event, lang, label, product_id) values ('add_to_cart', 'ru', 'fabao-selftest', p);  -- duplicate
  for i in 1..80 loop
    insert into public.site_events (event, lang, label) values ('pageview', 'ru', 'fabao-selftest');               -- flood
  end loop;
  select count(*) filter (where event = 'add_to_cart'), count(*) into dup, kept
    from public.site_events where label = 'fabao-selftest';
  delete from public.site_events where label = 'fabao-selftest';
  perform set_config('request.headers', '', true);
  if dup <> 1 or kept <> 60 then
    raise exception 'self-test failed: % add_to_cart (expected 1), % rows kept (expected 60) — nothing was changed', dup, kept;
  end if;
  raise notice 'self-test ok: duplicate dropped, flood capped at 60 per minute';
end;
$$;

commit;
