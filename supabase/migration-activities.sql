-- Migration: activities (things to do in Watamu)
-- Run once in the Supabase SQL editor. Backs the /activities page and the
-- teaser row on the homepage, both rendered server-side by the API so the
-- content is in the HTML for search engines.
--
-- Deliberately no price columns: the page recommends things and invites the
-- guest to ask. Prices for other people's businesses go stale and turn the
-- page into a liability; "we can arrange this" does not.
--
-- Safe to re-run. Seeds placeholder entries only while the table is empty,
-- all unpublished, so nothing appears on the live site until the real photos
-- and wording are filled in from the dashboard.

create table if not exists activities (
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

-- Added after the first cut. Kept as a flag rather than a category, because
-- an activity can be watersports and good with kids at the same time — a
-- category would force a choice between the two.
alter table activities
  add column if not exists kid_friendly boolean not null default false;

-- Each activity gets its own page at /activities/<slug>, which is what makes
-- per-activity SEO possible at all: meta tags and social images belong to a
-- URL, so without a page of its own there is nowhere for them to live. All
-- three SEO fields are optional and fall back to the activity's own title,
-- summary and photo.
alter table activities
  add column if not exists slug text,
  add column if not exists seo_title text check (char_length(seo_title) <= 200),
  add column if not exists seo_description text check (char_length(seo_description) <= 400),
  add column if not exists og_image_url text;

create index if not exists activities_sort_order_idx on activities (sort_order);
create index if not exists activities_featured_idx on activities (featured) where featured;

alter table activities enable row level security;

drop policy if exists "public read published activities" on activities;
create policy "public read published activities"
  on activities for select
  using (published = true);

drop policy if exists "authenticated manage activities" on activities;
create policy "authenticated manage activities"
  on activities for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Photos for the cards. Same shape as the gallery bucket: public to read,
-- writable only by the logged-in owner, with the size and type limits
-- enforced by storage itself rather than trusted from the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-images', 'activity-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read activity bucket" on storage.objects;
create policy "public read activity bucket"
  on storage.objects for select
  using (bucket_id = 'activity-images');

drop policy if exists "authenticated manage activity bucket" on storage.objects;
create policy "authenticated manage activity bucket"
  on storage.objects for all
  using (bucket_id = 'activity-images' and auth.role() = 'authenticated')
  with check (bucket_id = 'activity-images' and auth.role() = 'authenticated');

-- Placeholders: the obvious Watamu categories, unpublished, with the wording
-- left deliberately plain so it reads as a draft rather than as a claim.
insert into activities (title, category, summary, description, we_arrange, distance_text, duration_text, featured, sort_order, published, kid_friendly)
select * from (values
  ('Watamu Beach', 'Beach', 'White sand and turquoise water, a short walk from the villa.', 'Watamu''s beach is the reason most guests come: a long curve of powder-white sand, water in three shades of turquoise, and coral outcrops standing offshore like sculptures.

The tide makes a real difference here. At low tide the sea pulls back to expose rock pools and firm flat sand that goes on for miles — ideal for a morning walk or a run. At high tide the swimming is excellent, calm inside the reef and warm all year.

It is a turtle nesting beach, so you may come across a marked nest above the tide line. Leave it undisturbed and tell us if it looks interfered with.', false, 'A short walk', null, true, 0, false, true),
  ('Watamu Marine National Park', 'Beach', 'Snorkelling over the coral gardens inside the protected park.', 'The marine park in front of Watamu is one of the oldest protected reefs in Africa, and it shows: the coral gardens are dense, the fish are unbothered by people, and the water is clear enough that you can see the bottom from the boat.

A trip is a half day. You take a boat out over the lagoon, snorkel a couple of sites, and usually see parrotfish, angelfish, moray eels and, with luck, a turtle grazing on the seagrass.

Park fees apply and are paid at the gate. The calmest water and best visibility are generally in the morning, before the wind picks up.', true, null, 'Half day', true, 1, false, true),
  ('Snorkelling & Diving', 'Watersports', 'Reef trips and dive courses with the dive centres in the bay.', 'Beyond the shallow coral of the lagoon, the reef drops into dive sites that suit everyone from a first-timer to someone logging their hundredth dive. Several established dive centres operate in the bay, running guided dives, try-dives for beginners and full certification courses.

Snorkelling needs nothing more than a boat and a mask, and is the easier option with children or anyone who would rather stay on the surface.

Tell us what you are after and we will point you at the right centre and get it booked before you arrive.', true, null, 'Half day', true, 2, false, false),
  ('Kitesurfing', 'Watersports', 'Lessons and board hire when the trade winds are blowing.', 'When the trade winds settle in, the flat water inside the reef turns into one of the better places on this coast to learn to kitesurf — steady wind, warm water, and a wide lagoon with room to make mistakes in.

Schools along the bay run lessons from a first afternoon on the trainer kite through to independent riding, and hire gear to anyone who already rides.

The wind is seasonal, so it is worth asking us what the conditions are likely to be before you plan a trip around it.', true, null, null, false, 3, false, false),
  ('Bike Hire', 'Bike Hire', 'Bikes for getting around Watamu at your own pace.', 'Watamu is flat, small and much better seen from a bike than through a car window. It is the easiest way to get to the beach, into the village for a coffee, or out along the quiet roads towards the forest.

Mornings and late afternoons are the time to ride — the middle of the day gets genuinely hot. Take water, and keep to the tarmac after dark.

Let us know how many bikes you need and what sizes, and we will have them waiting at the villa.', true, 'From the villa', 'Per day', true, 4, false, true),
  ('Mida Creek', 'Excursions', 'Mangrove boardwalk and dhow trips at sunset.', 'Mida Creek is a tidal inlet behind Watamu, ringed by mangroves and full of birds — herons, kingfishers, and flocks of waders working the mudflats when the tide is out.

A community-run boardwalk takes you out over the water into the mangroves, and a dhow can be arranged to sail the creek in the late afternoon. Sunset there, with the light going orange behind the mangroves, is the picture most guests come home with.

Go on a rising tide if you can — the creek is at its best with water in it.', true, null, 'Half day', false, 5, false, true),
  ('Gede Ruins', 'Excursions', 'The remains of a Swahili town, deep in the forest.', 'Gede is a Swahili town that was built in coral stone, lived in for centuries, and then abandoned — left to the forest, which has been quietly taking it back ever since. You walk among the walls of houses, a mosque and a palace, under enormous baobabs, with monkeys crashing about overhead.

It is shaded and flat, which makes it one of the easier outings with children. Guides at the gate are worth taking: the site makes much more sense with someone explaining what you are looking at.

Half a day is plenty, and it pairs well with the forest nearby.', true, null, 'Half day', false, 6, false, true),
  ('Arabuko Sokoke Forest', 'Excursions', 'Coastal forest walks and some of the best birding in Kenya.', 'Arabuko Sokoke is the largest stretch of coastal forest left in East Africa, and a serious destination for anyone who watches birds. Several species live here and almost nowhere else, which brings birders from all over the world.

Even without binoculars it is a good morning out: shaded trails, butterflies everywhere, and the chance of seeing a golden-rumped elephant shrew bolt across the path.

Go early, take a guide from the forest station, and wear something you do not mind getting dusty.', true, null, 'Half day', false, 7, false, false),
  ('Deep Sea Fishing', 'Watersports', 'Boat charters out beyond the reef.', 'The seabed drops away sharply not far off Watamu, which puts serious blue water within easy reach of the beach. Charters run out past the reef for sailfish, marlin, tuna and dorado, with most skippers here tagging and releasing billfish rather than bringing them in.

Boats go out for a half or a full day, leaving early. It is a long time on the water, so it suits confident sea-goers better than a first boat trip.

The fishing is seasonal — ask us what is running when you plan to visit.', true, null, 'Full day', false, 8, false, false),
  ('Restaurants in Watamu', 'Restaurants', 'Where we send guests to eat, from grilled seafood to sundowners.', 'For a small place, Watamu eats very well. The seafood comes in the same day, and a long Italian presence on this coast means the pizza and pasta are better than they have any right to be.

There is everything from plastic chairs and a charcoal grill by the road to candle-lit tables on the sand, plus beach bars that are worth timing for sunset rather than dinner.

Tell us what you are in the mood for and we will point you at the right place — and book it, since the good ones fill up in high season.', false, 'Nearby', null, false, 9, false, true)
) as v(title, category, summary, description, we_arrange, distance_text, duration_text, featured, sort_order, published, kid_friendly)
where not exists (select 1 from activities);

-- Slugs last, so freshly seeded rows get one too. Anything without a slug has
-- no page of its own, so this runs after every insert above.
update activities
set slug = regexp_replace(regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g'), '^-|-$', '', 'g')
where slug is null or slug = '';

-- Two activities sharing a slug would make one of them unreachable.
create unique index if not exists activities_slug_key on activities (slug);
