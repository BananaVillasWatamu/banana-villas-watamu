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
