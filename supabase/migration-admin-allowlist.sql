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
-- Safe to re-run.

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  added_at timestamptz not null default now()
);

alter table admins enable row level security;

-- Admins can see who else is an admin; nobody else can see the table at all.
-- Adding or removing an admin is done with the service-role key or from the
-- Supabase SQL editor, deliberately — not from the dashboard UI.
drop policy if exists "admins read the allowlist" on admins;
create policy "admins read the allowlist"
  on admins for select
  using (exists (select 1 from admins a where a.user_id = auth.uid()));

-- Seed with every account that exists today, so running this does not lock
-- anyone out. Check the list afterwards: select * from admins;
insert into admins (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

-- Helper used by every policy below. security definer so it can read the
-- allowlist regardless of the caller's own permissions.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

revoke execute on function is_admin() from public;
grant execute on function is_admin() to authenticated, service_role;

-- Re-point every "authenticated can do anything" policy at the allowlist.
-- The public read policies (published reviews, visible gallery images,
-- published faqs and activities) are untouched.

drop policy if exists "authenticated manage reviews" on reviews;
create policy "admins manage reviews" on reviews for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage bookings" on bookings;
create policy "admins manage bookings" on bookings for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage enquiries" on enquiries;
create policy "admins manage enquiries" on enquiries for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage gallery images" on gallery_images;
create policy "admins manage gallery images" on gallery_images for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage faqs" on faqs;
create policy "admins manage faqs" on faqs for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage activities" on activities;
create policy "admins manage activities" on activities for all
  using (is_admin()) with check (is_admin());

drop policy if exists "authenticated manage site settings" on site_settings;
create policy "admins manage site settings" on site_settings for all
  using (is_admin()) with check (is_admin());

-- Storage: same treatment for both buckets. Reading stays public because the
-- photos are shown on the site; writing becomes admin-only.
drop policy if exists "authenticated manage gallery bucket" on storage.objects;
create policy "admins manage gallery bucket"
  on storage.objects for all
  using (bucket_id = 'gallery-images' and is_admin())
  with check (bucket_id = 'gallery-images' and is_admin());

drop policy if exists "authenticated manage activity bucket" on storage.objects;
create policy "admins manage activity bucket"
  on storage.objects for all
  using (bucket_id = 'activity-images' and is_admin())
  with check (bucket_id = 'activity-images' and is_admin());

-- Check afterwards:
--   select email from admins;                      -- who has access
--   select tablename, policyname from pg_policies  -- what the policies say
--   where schemaname = 'public' order by tablename;
