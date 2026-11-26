-- FABAO: team roles for the admin panel (2026-11)
-- Run once in Supabase → SQL Editor (select all, then Run). Safe to run again.
--
-- Roles, from most to least rights:
--   owner            everything, including the «Команда» tab (who has access)
--   general_manager  everything except the team list and wiping statistics
--   sales_manager    products (add, edit, photos, stock, price), statistics
--   agent            sees the catalogue in the panel (hidden products too), edits nothing
--
-- The database enforces this (row level security), so hiding a button in the
-- panel is only for convenience: a sales manager cannot change brands or texts
-- even by calling the API directly.

begin;

-- 1. A role for every person on the staff list. Everyone already listed keeps
--    full rights (owner); new people default to the smallest role.
alter table public.staff add column if not exists role text;
update public.staff set role = 'owner' where role is null;
alter table public.staff alter column role set not null;
alter table public.staff alter column role set default 'agent';
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('owner', 'general_manager', 'sales_manager', 'agent'));
update public.staff set email = lower(trim(email)) where email <> lower(trim(email));
alter table public.staff drop constraint if exists staff_email_lower;
alter table public.staff add constraint staff_email_lower check (email = lower(trim(email)));

-- 2. Who am I, and what may I do?
create or replace function public.staff_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.staff
   where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.can(perm text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(case perm
    when 'team'            then public.staff_role() = 'owner'
    when 'stats_reset'     then public.staff_role() = 'owner'
    when 'content'         then public.staff_role() in ('owner', 'general_manager')
    when 'products_delete' then public.staff_role() in ('owner', 'general_manager')
    when 'products'        then public.staff_role() in ('owner', 'general_manager', 'sales_manager')
    when 'upload'          then public.staff_role() in ('owner', 'general_manager', 'sales_manager')
    when 'stats'           then public.staff_role() in ('owner', 'general_manager', 'sales_manager')
    else false end, false);
$$;

revoke all on function public.staff_role() from public;
revoke all on function public.can(text) from public;
grant execute on function public.staff_role() to anon, authenticated;
grant execute on function public.can(text) to anon, authenticated;

-- 3. Team list: every staff member can see it, only the owner can change it.
grant select, insert, update, delete on public.staff to authenticated;
drop policy if exists "staff can see staff list" on public.staff;
create policy "staff can see staff list" on public.staff
  for select to authenticated using (public.is_staff());
drop policy if exists "owner manages team" on public.staff;
create policy "owner manages team" on public.staff
  for all to authenticated using (public.can('team')) with check (public.can('team'));

-- Never leave the site without an owner (also blocks locking yourself out).
create or replace function public.staff_keep_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.staff where role = 'owner') then
    raise exception 'Нужен хотя бы один владелец (owner)';
  end if;
  return null;
end;
$$;
drop trigger if exists staff_keep_owner on public.staff;
create trigger staff_keep_owner after update or delete on public.staff
  for each statement execute function public.staff_keep_owner();

-- 4. Content (brands, texts, carousel, blog): owner and general manager.
drop policy if exists "staff writes brands" on public.brands;
create policy "staff writes brands" on public.brands
  for all to authenticated using (public.can('content')) with check (public.can('content'));
drop policy if exists "staff writes settings" on public.site_settings;
create policy "staff writes settings" on public.site_settings
  for all to authenticated using (public.can('content')) with check (public.can('content'));
drop policy if exists "staff writes promos" on public.promos;
create policy "staff writes promos" on public.promos
  for all to authenticated using (public.can('content')) with check (public.can('content'));
drop policy if exists "staff writes posts" on public.posts;
create policy "staff writes posts" on public.posts
  for all to authenticated using (public.can('content')) with check (public.can('content'));

-- 5. Products: sales manager and up add and edit; deleting is for managers.
drop policy if exists "staff writes products" on public.products;
drop policy if exists "staff adds products" on public.products;
create policy "staff adds products" on public.products
  for insert to authenticated with check (public.can('products'));
drop policy if exists "staff edits products" on public.products;
create policy "staff edits products" on public.products
  for update to authenticated using (public.can('products')) with check (public.can('products'));
drop policy if exists "managers delete products" on public.products;
create policy "managers delete products" on public.products
  for delete to authenticated using (public.can('products_delete'));

-- 6. Photos (product, brand, slide and story images share one bucket).
drop policy if exists "staff uploads product images" on storage.objects;
create policy "staff uploads product images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.can('upload'));
drop policy if exists "staff updates product images" on storage.objects;
create policy "staff updates product images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.can('upload'));
drop policy if exists "staff deletes product images" on storage.objects;
create policy "staff deletes product images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.can('upload'));

-- 7. Statistics: read for sales manager and up; wiping is for the owner.
drop policy if exists "staff read events" on public.site_events;
create policy "staff read events" on public.site_events
  for select to authenticated using (public.can('stats'));
drop policy if exists "staff delete events" on public.site_events;
create policy "staff delete events" on public.site_events
  for delete to authenticated using (public.can('stats_reset'));

-- 8. The sales manager (Eldar's request, 2026-11-26). They still need a login:
--    Authentication → Users → Invite user → fabao.kyrgyz@gmail.com.
insert into public.staff (email, name, role)
values ('fabao.kyrgyz@gmail.com', 'Sales Manager', 'sales_manager')
on conflict (email) do update set role = excluded.role;

commit;

-- Check: should list everyone with a role, the sales manager among them.
select email, name, role from public.staff order by role, email;
