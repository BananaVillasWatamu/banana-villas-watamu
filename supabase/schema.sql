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
  -- Where the review was left, and the link back to it. The site shows the
  -- platform's logo and links through, so a guest can check the review is
  -- real rather than taking the site's word for it.
  source text not null default 'direct'
    check (source in ('google', 'airbnb', 'booking_com', 'tripadvisor', 'direct')),
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

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and
-- Supabase additionally auto-grants EXECUTE directly to the anon and
-- authenticated roles via its default privileges on the public schema —
-- so revoking from PUBLIC alone is NOT enough; anon's own direct grant
-- survives that. Since this function is SECURITY DEFINER, leaving either
-- grant in place lets anyone with the public anon key call it directly
-- over PostgREST, bypassing the input validation and rate limiting that
-- live in /api/bookings.js. Revoke from all three explicitly and only
-- grant back to the server's service-role key.
revoke execute on function request_booking(date, date, text, text, text, int, int, text) from public;
revoke execute on function request_booking(date, date, text, text, text, int, int, text) from anon;
revoke execute on function request_booking(date, date, text, text, text, int, int, text) from authenticated;
grant execute on function request_booking(date, date, text, text, text, int, int, text) to service_role;

-- Enquiries ---------------------------------------------------------------
-- Every submission of the public booking form lands here, whether or not it
-- turned into a booking hold: dates already taken, rate-limited, or the guest
-- jumping straight to WhatsApp with a half-filled form all still leave a
-- lead the owner can follow up on. Bookings stay the source of truth for the
-- calendar; this table is the enquiry log beside it.

create type enquiry_channel as enum ('form', 'whatsapp');

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  guest_name text check (char_length(guest_name) <= 200),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  checkin date,
  checkout date,
  adults int,
  kids int,
  notes text check (char_length(notes) <= 4000),
  transfer boolean not null default false,
  channel enquiry_channel not null default 'form',
  -- 'requested' | 'unavailable' | 'rate_limited' | 'invalid' | 'error' |
  -- 'whatsapp_only' — why the enquiry did or didn't become a hold.
  outcome text check (char_length(outcome) <= 40),
  booking_id uuid references bookings(id) on delete set null,
  handled boolean not null default false,
  created_ip text,
  created_at timestamptz not null default now()
);

create index enquiries_created_at_idx on enquiries (created_at desc);

alter table enquiries enable row level security;

-- Same shape as bookings: no public policy at all. Guests never touch this
-- table directly — /api/bookings and /api/enquiries write to it with the
-- service-role key, which bypasses RLS.
create policy "authenticated manage enquiries"
  on enquiries for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Gallery ------------------------------------------------------------------

create table gallery_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  public_url text not null,
  alt_text text not null default '',
  sort_order int not null default 0,
  visible boolean not null default true,
  -- Picked out in the dashboard to appear in the header slider on the home
  -- page. The site shows the first four of these, in sort_order.
  hero_slide boolean not null default false,
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

-- FAQs --------------------------------------------------------------------
-- The questions that used to be hardcoded in the FAQ section of the site.
-- seed.sql loads the original eight so nothing changes on the public page
-- until the owner edits them from the dashboard.

create table faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) <= 300),
  answer text not null check (char_length(answer) <= 4000),
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index faqs_sort_order_idx on faqs (sort_order);

alter table faqs enable row level security;

create policy "public read published faqs"
  on faqs for select
  using (published = true);

create policy "authenticated manage faqs"
  on faqs for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Activities ---------------------------------------------------------------
-- Things to do in Watamu, rendered into /activities and the homepage teaser
-- by the API. No price columns on purpose: the page recommends things and
-- invites the guest to ask, so nothing here can go stale when someone else's
-- business changes its rates.

create table activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 160),
  -- Free text rather than an enum so a new category is a dropdown entry in
  -- the dashboard, not a migration.
  category text not null default 'Excursions' check (char_length(category) <= 60),
  summary text not null default '' check (char_length(summary) <= 400),
  description text not null default '' check (char_length(description) <= 4000),
  image_path text,
  image_url text,
  -- Changes the button from "Ask us about it" to "Book through us".
  we_arrange boolean not null default false,
  -- A flag rather than a category: an activity can be watersports and good
  -- with kids at once, and a category would force a choice between them.
  kid_friendly boolean not null default false,
  -- Address of this activity's own page, /activities/<slug>, which is what
  -- gives its meta tags and social image somewhere to live.
  slug text unique,
  -- All optional: each falls back to the title, summary and photo above.
  seo_title text check (char_length(seo_title) <= 200),
  seo_description text check (char_length(seo_description) <= 400),
  og_image_url text,
  -- e.g. "5 min walk", "20 min drive" — kept as text because the useful
  -- answer is rarely a number.
  distance_text text check (char_length(distance_text) <= 80),
  duration_text text check (char_length(duration_text) <= 80),
  featured boolean not null default false,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_sort_order_idx on activities (sort_order);
create index activities_featured_idx on activities (featured) where featured;

alter table activities enable row level security;

create policy "public read published activities"
  on activities for select
  using (published = true);

create policy "authenticated manage activities"
  on activities for all
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
  -- Business details rendered into the homepage as LodgingBusiness
  -- structured data by /api/index.js — this is what Google reads for the
  -- name, address, phone and map pin. All editable from the SEO tab.
  business_name text default 'Banana Villas Watamu',
  business_description text default 'Luxury 3-bedroom villa with oasis pool, beach access, and tropical surroundings in Watamu, Kenya.',
  telephone text default '+254715257111',
  email text default 'contact@bananavillaswatamu.com',
  street_address text default 'Plot 442 Turtle Bay Road',
  address_locality text default 'Watamu',
  address_region text default 'Kilifi County',
  address_country text default 'KE',
  latitude numeric(9, 6) default -3.364829,
  longitude numeric(9, 6) default 39.998538,
  maps_url text default 'https://maps.app.goo.gl/CpwYLHs1epv3yJTHA',
  number_of_rooms int default 3,
  price_range text,
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

-- Photos for the cards. Same shape as the gallery bucket: public to read,
-- writable only by the logged-in owner, with the size and type limits
-- enforced by storage itself rather than trusted from the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-images', 'activity-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public read activity bucket"
  on storage.objects for select
  using (bucket_id = 'activity-images');

create policy "authenticated manage activity bucket"
  on storage.objects for all
  using (bucket_id = 'activity-images' and auth.role() = 'authenticated')
  with check (bucket_id = 'activity-images' and auth.role() = 'authenticated');
