-- One-time seed: migrates the reviews/photos that were hardcoded in the
-- original static site into the database, so the admin dashboard has real,
-- editable rows matching what's already live. Safe to re-run — each insert
-- is guarded by "where not exists" so it won't duplicate rows.

insert into reviews (guest_name, rating, review_date, body, published)
select * from (values
  ('Sarah M.', 5, date '2024-07-15', 'Absolutely stunning villa. The pool is even more beautiful in person and the team were incredibly helpful throughout our stay. We''ll definitely be back!', true),
  ('James K.', 5, date '2024-12-05', 'Perfect escape from the city. The villa is immaculate, the private pool is divine, and Watamu itself is a hidden gem. Highly recommend the private chef option!', true),
  ('Amina N.', 5, date '2024-08-10', 'We booked for a family reunion and it was perfect. Spacious rooms, amazing outdoor spaces, and the beach is just a short walk. An unforgettable experience.', true)
) as v(guest_name, rating, review_date, body, published)
where not exists (select 1 from reviews);

insert into gallery_images (storage_path, public_url, alt_text, sort_order, visible)
select * from (values
  ('images/Banana Villas Watamu Photo -  (1).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(1).jpg', 'Banana Villas Watamu exterior view', 0, true),
  ('images/Banana Villas Watamu Photo -  (16).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(16).jpg', 'Fully equipped kitchen at Banana Villas', 1, true),
  ('images/Banana Villas Watamu Photo -  (18).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(18).jpg', 'Spacious living area with tropical views', 2, true),
  ('images/Banana Villas Watamu Photo -  (2).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(2).jpg', 'Villa outdoor area and gardens', 3, true),
  ('images/Banana Villas Watamu Photo -  (3).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(3).jpg', 'Tropical garden surroundings', 4, true),
  ('images/Banana Villas Watamu Photo -  (44).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(44).jpg', 'Master bedroom at Banana Villas', 5, true),
  ('images/Banana Villas Watamu Photo -  (46).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(46).jpg', 'Comfortable living room seating area', 6, true),
  ('images/Banana Villas Watamu Photo -  (47).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(47).jpg', 'Villa dining and entertainment space', 7, true),
  ('images/Banana Villas Watamu Photo -  (62).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(62).jpg', 'Air-conditioned guest bedroom', 8, true),
  ('images/Banana Villas Watamu Photo -  (64).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(64).jpg', 'Villa bathroom and amenities', 9, true),
  ('images/Banana Villas Watamu Photo -  (66).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(66).jpg', 'Outdoor terrace and relaxation area', 10, true),
  ('images/Banana Villas Watamu Photo -  (67).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(67).jpg', 'Lush tropical landscape at Banana Villas', 11, true),
  ('images/Banana Villas Watamu Photo -  (7).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(7).jpg', 'Oasis-style swimming pool at sunset', 12, true),
  ('images/Banana Villas Watamu Photo -  (71).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(71).jpg', 'Pool area with sun loungers', 13, true),
  ('images/Banana Villas Watamu Photo -  (73).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(73).jpg', 'Scenic view from Banana Villas Watamu', 14, true),
  ('images/Banana Villas Watamu Photo -  (76).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(76).jpg', 'Villa architecture and design details', 15, true),
  ('images/Banana Villas Watamu Photo -  (78).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(78).jpg', 'Banana Villas Watamu front view', 16, true),
  ('images/Banana Villas Watamu Photo -  (80).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(80).jpg', 'Sparkling swimming pool area', 17, true),
  ('images/Banana Villas Watamu Photo -  (82).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(82).jpg', 'Tropical garden and outdoor space', 18, true),
  ('images/Banana Villas Watamu Photo -  (9).jpg', 'https://banana-villas-watamu.vercel.app/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(9).jpg', 'Interior living space at Banana Villas', 19, true)
) as v(storage_path, public_url, alt_text, sort_order, visible)
where not exists (select 1 from gallery_images);

-- The FAQ questions that were hardcoded in the original static site.
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

-- Start the header slider off with the first four visible photos; which ones
-- it uses is editable from the Gallery tab in the dashboard.
update gallery_images
set hero_slide = true
where id in (
  select id from gallery_images where visible order by sort_order limit 4
)
and not exists (select 1 from gallery_images where hero_slide);
