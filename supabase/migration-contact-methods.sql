-- Migration: editable phone numbers and email addresses
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- The contact section, the floating WhatsApp button, the activities pages,
-- the 404 page and the llms.txt feed all carried the same number typed out by
-- hand. Changing it meant finding seven files. They now all read this table.
--
-- One row per way of reaching the villa. `kind` decides how it is rendered
-- (tel: link, wa.me link, mailto: link), `label` is the caption a guest sees
-- next to it ("Primary", "Backup"), and the row flagged `is_primary` is the
-- one the rest of the site uses when it needs a single number or address —
-- the WhatsApp float, the booking form hand-off, Google's structured data.

create table if not exists contact_methods (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('phone', 'whatsapp', 'email')),
  -- Shown in brackets after the number, so leave it blank when there is only
  -- one of a kind and "Primary" would just be noise.
  label text not null default '' check (char_length(label) <= 60),
  value text not null check (char_length(value) between 1 and 200),
  is_primary boolean not null default false,
  sort_order int not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A second primary of the same kind would make "the" number ambiguous
-- everywhere it is used, so the database refuses it rather than letting the
-- site pick one arbitrarily.
create unique index if not exists contact_methods_one_primary_per_kind
  on contact_methods (kind)
  where is_primary;

alter table contact_methods enable row level security;

drop policy if exists "public read visible contact methods" on contact_methods;
create policy "public read visible contact methods"
  on contact_methods for select
  using (visible = true);

drop policy if exists "authenticated manage contact methods" on contact_methods;
create policy "authenticated manage contact methods"
  on contact_methods for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed with exactly what the templates used to hardcode, so the site looks
-- the same the moment this runs and nothing has to be retyped. Only on an
-- empty table — re-running must not resurrect rows that were deleted on
-- purpose.
insert into contact_methods (kind, label, value, is_primary, sort_order)
select * from (values
  ('phone',    '',  '+254715257111',                  true,  0),
  ('whatsapp', '',  '+254715257111',                  true,  1),
  ('email',    '',  'contact@bananavillaswatamu.com', true,  2)
) as seed(kind, label, value, is_primary, sort_order)
where not exists (select 1 from contact_methods);
