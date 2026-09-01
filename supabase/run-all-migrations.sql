-- Banana Villas Watamu — all pending migrations, in one script.
-- Paste the whole thing into the Supabase SQL editor and press Run.
-- Everything here is idempotent: running it twice is harmless.
--
-- Covers: the enquiry log, editable FAQs, the header slider flag, and the
-- editable business details behind the site's structured data.


-- ===========================================================
-- 1. enquiry log  (from supabase/migration-enquiries.sql)
-- ===========================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'enquiry_channel') then
    create type enquiry_channel as enum ('form', 'whatsapp');
  end if;
end
$$;

create table if not exists enquiries (
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
  outcome text check (char_length(outcome) <= 40),
  booking_id uuid references bookings(id) on delete set null,
  handled boolean not null default false,
  created_ip text,
  created_at timestamptz not null default now()
);

create index if not exists enquiries_created_at_idx on enquiries (created_at desc);

alter table enquiries enable row level security;

drop policy if exists "authenticated manage enquiries" on enquiries;
create policy "authenticated manage enquiries"
  on enquiries for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');


-- ===========================================================
-- 2. editable FAQs  (from supabase/migration-faqs.sql)
-- ===========================================================

create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) <= 300),
  answer text not null check (char_length(answer) <= 4000),
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faqs_sort_order_idx on faqs (sort_order);

alter table faqs enable row level security;

drop policy if exists "public read published faqs" on faqs;
create policy "public read published faqs"
  on faqs for select
  using (published = true);

drop policy if exists "authenticated manage faqs" on faqs;
create policy "authenticated manage faqs"
  on faqs for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into faqs (question, answer, sort_order, published)
select * from (values
  ('What is the minimum stay?', 'We require a minimum of 2 nights during low season, 3 nights during high season, and 5 nights over peak periods (Christmas, New Year, and Easter).', 0, true),
  ('How many guests can the villa accommodate?', 'The villa comfortably sleeps up to 8 guests across 3 bedrooms. A cot is available on request for infants. Please contact us if your group is larger.', 1, true),
  ('Is the villa pet-friendly?', 'We are not able to accommodate pets at this time. Please get in touch if you have any special requirements and we''ll do our best to assist.', 2, true),
  ('What is the cancellation policy?', 'Cancellations 30+ days before check-in receive a full refund. Cancellations within 14–29 days receive a 50% refund. Cancellations within 14 days are non-refundable. Contact us for special circumstances.', 3, true),
  ('Is airport transfer available?', 'Yes — we can arrange private transfers from Malindi (MYD) or Mombasa (MBA) airports. Provide your flight details when booking and we''ll quote accordingly.', 4, true),
  ('Can I hire a private chef?', 'Absolutely. A private chef is available on request and can prepare local Kenyan coastal cuisine and international dishes. Mention this in your booking enquiry.', 5, true),
  ('Is there WiFi at the villa?', 'Yes, the villa has high-speed WiFi throughout. The backup generator ensures uninterrupted power — and internet — even during outages.', 6, true),
  ('What are the check-in and check-out times?', 'Standard check-in is from 2:00 PM and check-out by 11:00 AM. Early check-in or late check-out may be possible subject to availability — just ask in advance.', 7, true)
) as v(question, answer, sort_order, published)
where not exists (select 1 from faqs);


-- ===========================================================
-- 3. header slider  (from supabase/migration-hero-slider.sql)
-- ===========================================================

alter table gallery_images
  add column if not exists hero_slide boolean not null default false;

update gallery_images
set hero_slide = true
where id in (
  select id from gallery_images where visible order by sort_order limit 4
)
and not exists (select 1 from gallery_images where hero_slide);


-- ===========================================================
-- 4. business details  (from supabase/migration-business-schema.sql)
-- ===========================================================

alter table site_settings
  add column if not exists business_name text,
  add column if not exists business_description text,
  add column if not exists telephone text,
  add column if not exists email text,
  add column if not exists street_address text,
  add column if not exists address_locality text,
  add column if not exists address_region text,
  add column if not exists address_country text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists maps_url text,
  add column if not exists number_of_rooms int,
  add column if not exists price_range text;

update site_settings set
  business_name = coalesce(business_name, 'Banana Villas Watamu'),
  business_description = coalesce(business_description, 'Luxury 3-bedroom villa with oasis pool, beach access, and tropical surroundings in Watamu, Kenya.'),
  telephone = coalesce(telephone, '+254715257111'),
  email = coalesce(email, 'contact@bananavillaswatamu.com'),
  street_address = coalesce(street_address, 'Plot 442 Turtle Bay Road'),
  address_locality = coalesce(address_locality, 'Watamu'),
  address_region = coalesce(address_region, 'Kilifi County'),
  address_country = coalesce(address_country, 'KE'),
  latitude = coalesce(latitude, -3.364829),
  longitude = coalesce(longitude, 39.998538),
  maps_url = coalesce(maps_url, 'https://maps.app.goo.gl/CpwYLHs1epv3yJTHA'),
  number_of_rooms = coalesce(number_of_rooms, 3)
where id = 1;
