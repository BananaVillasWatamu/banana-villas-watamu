-- Migration: enquiry log for the public booking form
-- Run once in the Supabase SQL editor on an existing database. (A fresh
-- database created from schema.sql already has all of this — the statements
-- below are idempotent, so running it there is harmless too.)

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
