-- Migration: a WhatsApp number of its own on bookings
--
-- A guest's WhatsApp is often not the number they give you to call, so it gets
-- its own column rather than overloading `phone`. It is what the Guests list
-- in the dashboard messages from, so it is worth keeping separate and clean.
--
-- Safe to re-run.

alter table bookings
  add column if not exists whatsapp text check (char_length(whatsapp) <= 40);

-- Enquiries come through the public form, which only asks for one number, so
-- that number is also the WhatsApp one in practice. Nothing to add there.

comment on column bookings.whatsapp is
  'WhatsApp number for this guest, when it differs from phone. Used by the Guests list to start a chat.';
