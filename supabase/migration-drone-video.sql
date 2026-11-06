-- Migration: drone video on the homepage
-- Run once in the Supabase SQL editor on an existing database. Adds the
-- YouTube link behind the "See It From Above" section; the section stays
-- hidden while this is empty or while drone_video_visible is off. Edited from
-- the Gallery tab. Safe to re-run.

alter table site_settings
  add column if not exists drone_video_url text,
  add column if not exists drone_video_visible boolean not null default true;
