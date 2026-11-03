-- Migration: restrict the dashboard's data to named admins
--
-- WHY THIS MATTERS
-- Every policy on this project was written as `auth.role() = 'authenticated'`,
-- which is true for ANY signed-in Supabase account — not just yours. Public
-- signup is enabled on the project, so anyone could register an account,
-- confirm it with their own email, and then read every booking and enquiry
-- (guest names, phone numbers, email addresses) and edit the site's content.
--
-- Turning signup off in the Supabase dashboard closes the door. This closes
-- it again from the inside: even with an account, only user ids listed in
-- `admins` can touch the data. Do both.
--
-- Safe to re-run: every policy is dropped before it is created, and the
-- admins list is only seeded while it is empty, so running this again never
-- promotes accounts that signed up since. Re-run it after any older script
-- that may have put an "authenticated manage ..." policy back.

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  added_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Seed with every account that exists today, so the first run does not lock
-- anyone out. Check the list afterwards: select * from admins;
insert into admins (user_id, email)
select id, email from auth.users
where not exists (select 1 from admins)
on conflict (user_id) do nothing;

-- Helper used by every policy below. security definer so it can read the
-- allowlist regardless of the caller's own permissions; it runs as the table
-- owner, which RLS does not apply to.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- anon must be able to call it too: Postgres evaluates every policy on a
-- table, so the admin policies run on public reads of the gallery, reviews
-- and so on, and a revoked function makes those reads fail outright. It
-- only ever answers false for a visitor who is not signed in.
grant execute on function is_admin() to anon, authenticated, service_role;

-- Admins can see who else is an admin; nobody else can see the table at all.
-- Adding or removing an admin is done with the service-role key or from the
-- Supabase SQL editor, deliberately — not from the dashboard UI. (Uses
-- is_admin() rather than querying admins inline, which recursed.)
drop policy if exists "admins read the allowlist" on admins;
create policy "admins read the allowlist"
  on admins for select
  using (is_admin());

-- Re-point every "authenticated can do anything" policy at the allowlist.
-- The public read policies (published reviews, visible gallery images,
-- published faqs and activities, visible contact methods) are untouched.

drop policy if exists "authenticated manage reviews" on reviews;
drop policy if exists "admins manage reviews" on reviews;
create policy "admins manage reviews" on reviews for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage bookings" on bookings;
drop policy if exists "admins manage bookings" on bookings;
create policy "admins manage bookings" on bookings for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage enquiries" on enquiries;
drop policy if exists "admins manage enquiries" on enquiries;
create policy "admins manage enquiries" on enquiries for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage gallery images" on gallery_images;
drop policy if exists "admins manage gallery images" on gallery_images;
create policy "admins manage gallery images" on gallery_images for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage faqs" on faqs;
drop policy if exists "admins manage faqs" on faqs;
create policy "admins manage faqs" on faqs for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage activities" on activities;
drop policy if exists "admins manage activities" on activities;
create policy "admins manage activities" on activities for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage site settings" on site_settings;
drop policy if exists "admins manage site settings" on site_settings;
create policy "admins manage site settings" on site_settings for all
  using (is_admin()) with check (is_admin());

-- The phone numbers and emails shown across the site. This table arrived
-- after the first version of this migration and was left writable by any
-- signed-in account; skipped on a database that does not have it yet.
do $$
begin
  if to_regclass('public.contact_methods') is not null then
    drop policy if exists "authenticated manage contact methods" on contact_methods;
    drop policy if exists "admins manage contact methods" on contact_methods;
    create policy "admins manage contact methods" on contact_methods for all
      using (is_admin()) with check (is_admin());
  end if;
end
$$;

-- Storage: same treatment for both buckets. Reading stays public because the
-- photos are shown on the site; writing becomes admin-only.
drop policy if exists "authenticated manage gallery bucket" on storage.objects;
drop policy if exists "admins manage gallery bucket" on storage.objects;
create policy "admins manage gallery bucket"
  on storage.objects for all
  using (bucket_id = 'gallery-images' and is_admin())
  with check (bucket_id = 'gallery-images' and is_admin());

drop policy if exists "authenticated manage activity bucket" on storage.objects;
drop policy if exists "admins manage activity bucket" on storage.objects;
create policy "admins manage activity bucket"
  on storage.objects for all
  using (bucket_id = 'activity-images' and is_admin())
  with check (bucket_id = 'activity-images' and is_admin());

-- Check afterwards — the second query should return no rows:
--   select email from admins;
--   select tablename, policyname from pg_policies
--   where qual ilike '%authenticated%' or with_check ilike '%authenticated%';
