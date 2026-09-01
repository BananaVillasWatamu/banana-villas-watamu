-- Migration: editable FAQs
-- Run once in the Supabase SQL editor on an existing database. Creates the
-- faqs table and loads the eight questions that were hardcoded in the site,
-- so the public FAQ section looks exactly the same until they're edited from
-- the dashboard. Safe to re-run: the seed only fires on an empty table.

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
