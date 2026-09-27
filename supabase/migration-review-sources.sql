-- Migration: where each review came from
-- Run once in the Supabase SQL editor. Adds the platform a review was left
-- on, so the site can show its logo and link through to the original.
--
-- source_url already existed and was never displayed anywhere; it is now the
-- link behind the badge. Safe to re-run.

alter table reviews
  add column if not exists source text not null default 'direct'
    check (source in ('google', 'airbnb', 'booking_com', 'tripadvisor', 'direct'));

-- Work out the platform for any review that already has a link, so existing
-- rows don't all have to be edited by hand.
update reviews set source = 'google'
where source = 'direct' and source_url ilike '%google.%';

update reviews set source = 'airbnb'
where source = 'direct' and source_url ilike '%airbnb.%';

update reviews set source = 'booking_com'
where source = 'direct' and source_url ilike '%booking.com%';

update reviews set source = 'tripadvisor'
where source = 'direct' and source_url ilike '%tripadvisor.%';
