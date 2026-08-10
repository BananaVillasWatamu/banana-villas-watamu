-- Banana Villas Watamu — Supabase schema
-- Run once in the Supabase SQL editor (Database -> SQL Editor -> New query).
-- This also creates and locks down the "gallery-images" Storage bucket (see
-- the bottom of this file) — no manual dashboard steps needed for that.

create extension if not exists pgcrypto;

create type booking_status as enum ('pending', 'confirmed', 'declined', 'expired');
create type booking_source as enum ('direct', 'airbnb', 'booking_com', 'blocked');

-- Reviews --------------------------------------------------------------

create table reviews (
  id uuid primary key default gen_random_uuid(),
  source_url text check (char_length(source_url) <= 500),
  rating smallint not null check (rating between 1 and 5),
  guest_name text not null check (char_length(guest_name) <= 200),
  review_date date not null,
  body text not null check (char_length(body) <= 4000),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table reviews enable row level security;

create policy "public read published reviews"
  on reviews for select
  using (published = true);

create policy "authenticated manage reviews"
  on reviews for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Bookings ---------------------------------------------------------------

create table bookings (
  id uuid primary key default gen_random_uuid(),
  checkin date not null,
  checkout date not null,
  guest_name text check (char_length(guest_name) <= 200),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  adults int,
  kids int,
  notes text check (char_length(notes) <= 4000),
  status booking_status not null default 'pending',
  source booking_source not null default 'direct',
  hold_expires_at timestamptz,
  external_uid text,
  created_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_uid)
);

create index bookings_range_idx on bookings (checkin, checkout);

alter table bookings enable row level security;

-- No public select/insert policy: guests can only create a booking through
-- the request_booking() function below (SECURITY DEFINER), and only the
-- owner (authenticated) or server functions using the service-role key can
-- read/update rows directly. This keeps guest PII out of reach of the
-- public anon key. The owner also inserts rows directly for manual date
-- blocks (source = 'blocked') through this same policy — those don't need
-- the guest-facing overlap-checking RPC.
create policy "authenticated manage bookings"
  on bookings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Atomically checks for an overlapping active booking and inserts a new
-- 48-hour hold if the dates are free. Locks the table for the duration of
-- the check+insert to avoid a race between two guests submitting
-- overlapping dates at the same moment (fine at this booking volume; an
-- exclusion constraint can't be used here because it would need to
-- reference now(), which isn't allowed in a constraint).
create or replace function request_booking(
  p_checkin date,
  p_checkout date,
  p_name text,
  p_email text,
  p_phone text,
  p_adults int,
  p_kids int,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_count int;
  new_id uuid;
begin
  lock table bookings in share row exclusive mode;

  select count(*) into conflict_count
  from bookings
  where checkin < p_checkout
    and checkout > p_checkin
    and (status = 'confirmed' or (status = 'pending' and hold_expires_at > now()));

  if conflict_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  insert into bookings (
    checkin, checkout, guest_name, email, phone, adults, kids, notes,
    status, source, hold_expires_at
  )
  values (
    p_checkin, p_checkout, p_name, p_email, p_phone, p_adults, p_kids, p_notes,
    'pending', 'direct', now() + interval '48 hours'
  )
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC (which includes the
-- anon role) by default. Since this function is SECURITY DEFINER, that
-- would let anyone with the public anon key call it directly over
-- PostgREST — bypassing the input validation and rate limiting that live
-- in /api/bookings.js. Lock it down to only the server's service-role key.
revoke execute on function request_booking(date, date, text, text, text, int, int, text) from public;
grant execute on function request_booking(date, date, text, text, text, int, int, text) to service_role;

-- Gallery ------------------------------------------------------------------

create table gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  public_url text not null,
  alt_text text not null default '',
  sort_order int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

alter table gallery_images enable row level security;

create policy "public read visible gallery images"
  on gallery_images for select
  using (visible = true);

create policy "authenticated manage gallery images"
  on gallery_images for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- SEO / site settings (singleton row) --------------------------------------

create table site_settings (
  id int primary key default 1 check (id = 1),
  seo_title text not null default 'Banana Villas Watamu | Your Vacation Starts Here',
  seo_description text not null default 'Experience luxury and nature at Banana Villas Watamu. A premium villa with a stunning oasis-style swimming pool and modern architecture.',
  og_title text,
  og_description text,
  og_image_url text,
  airbnb_ical_url text,
  booking_ical_url text,
  updated_at timestamptz not null default now()
);

insert into site_settings (id) values (1);

alter table site_settings enable row level security;

create policy "authenticated manage site settings"
  on site_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
-- No public select policy: /api/index.js reads this with the service-role
-- key, which bypasses RLS entirely.

-- Storage bucket for gallery photos --------------------------------------
-- Public bucket (photos need to be viewable on the public site), but
-- writes are restricted to the logged-in owner, and Supabase enforces the
-- size/type limits below on every upload regardless of what the client
-- claims — the admin UI's accept="image/*" is only a client-side hint.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-images', 'gallery-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public read gallery bucket"
  on storage.objects for select
  using (bucket_id = 'gallery-images');

create policy "authenticated manage gallery bucket"
  on storage.objects for all
  using (bucket_id = 'gallery-images' and auth.role() = 'authenticated')
  with check (bucket_id = 'gallery-images' and auth.role() = 'authenticated');
