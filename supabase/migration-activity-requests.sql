-- Migration: activity requests land in the same inbox as everything else
--
-- An activity request is a lead like any other, so it goes in `enquiries`
-- rather than a table of its own — one inbox to check, one place to mark
-- things handled, the same rate limiting and the same WhatsApp reply button.
-- These two columns are what an activity request needs that a villa enquiry
-- does not: which activity, and when they would like to do it.
--
-- Safe to re-run.

alter table enquiries
  add column if not exists activity text check (char_length(activity) <= 160),
  add column if not exists activity_date date;

create index if not exists enquiries_activity_idx on enquiries (activity)
  where activity is not null;

comment on column enquiries.activity is
  'Name of the activity requested, when the enquiry came from an activity page rather than the booking form.';
