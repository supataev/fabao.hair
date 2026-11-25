-- Fabao site statistics: page views and clicks on WhatsApp / Instagram / products.
--
-- NOT RUN YET. Run once in Supabase → SQL Editor after Eldar approves.
-- Safe to run twice.
--
-- No new account and no cookies: the public page writes one small row per
-- event into this table, in the Supabase project Fabao already has. No IP
-- address, no user ID and nothing personal is stored, so no consent banner is
-- needed. Visitors can only ADD rows; only staff can read them (admin →
-- «Статистика»). Until this runs, the site simply skips the logging.

begin;

create table if not exists public.site_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  event         text not null check (event in ('pageview', 'consult', 'order', 'wholesale', 'instagram', 'product_open')),
  lang          text check (lang in ('ru', 'ky')),
  label         text check (char_length(label) <= 160),   -- product name for 'order' / 'product_open'
  referrer_host text check (char_length(referrer_host) <= 100),
  device        text check (device in ('mobile', 'desktop'))
);

create index if not exists site_events_created_at_idx on public.site_events (created_at desc);

alter table public.site_events enable row level security;

grant insert on public.site_events to anon, authenticated;
grant select, delete on public.site_events to authenticated;

drop policy if exists "anyone can log an event" on public.site_events;
create policy "anyone can log an event" on public.site_events
  for insert to anon, authenticated
  with check (created_at > now() - interval '5 minutes' and created_at < now() + interval '5 minutes');

drop policy if exists "staff read events" on public.site_events;
create policy "staff read events" on public.site_events
  for select to authenticated using (public.is_staff());

drop policy if exists "staff delete events" on public.site_events;
create policy "staff delete events" on public.site_events
  for delete to authenticated using (public.is_staff());

-- Daily totals for the admin panel (runs with the caller's rights, so only
-- staff get numbers back).
create or replace function public.site_stats(days int default 30)
returns table (day date, event text, label text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select (created_at at time zone 'Asia/Bishkek')::date as day, event, label, count(*) as n
    from public.site_events
   where created_at >= now() - make_interval(days => least(greatest(days, 1), 400))
   group by 1, 2, 3
   order by 1 desc;
$$;
grant execute on function public.site_stats(int) to authenticated;

commit;
