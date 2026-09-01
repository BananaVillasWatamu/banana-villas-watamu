-- Migration: header slider images
-- Run once in the Supabase SQL editor on an existing database. Adds the flag
-- that marks which gallery photos appear in the slider behind the header, and
-- picks the first four visible photos as a starting point. Safe to re-run:
-- the backfill only fires while nothing is flagged yet.

alter table gallery_images
  add column if not exists hero_slide boolean not null default false;

update gallery_images
set hero_slide = true
where id in (
  select id from gallery_images where visible order by sort_order limit 4
)
and not exists (select 1 from gallery_images where hero_slide);
