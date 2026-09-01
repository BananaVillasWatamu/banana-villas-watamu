-- Migration: editable business details for search engines
-- Run once in the Supabase SQL editor on an existing database. These columns
-- back the LodgingBusiness structured data that /api/index.js renders into the
-- homepage — the block Google reads for the name, address, phone and map pin.
-- Seeded with what was hardcoded in the template so nothing changes until the
-- details are edited from the dashboard. Safe to re-run.

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
