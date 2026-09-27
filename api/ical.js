const crypto = require('crypto');
const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');

// This feed is public — Airbnb and Booking.com fetch it unauthenticated — so
// it should not hand out the database's own booking ids. A stable hash keeps
// the UID stable across syncs (which is what the platforms match on) without
// publishing the primary key.
function eventUid(id) {
  return crypto.createHash('sha256').update(`bvw:${id}`).digest('hex').slice(0, 32);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toICSDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// Which platform this feed is being shared with. Each platform gets its own
// link so we can leave out the bookings that came from that platform in the
// first place: sending Airbnb's own reservations back to Airbnb makes it
// flag them as double-bookings against itself. `all` (the default) is the
// full feed, for Google Calendar or anything else.
const AUDIENCES = {
  airbnb: { excludeSource: 'airbnb', name: 'Banana Villas Watamu (for Airbnb)' },
  booking_com: { excludeSource: 'booking_com', name: 'Banana Villas Watamu (for Booking.com)' },
  all: { excludeSource: null, name: 'Banana Villas Watamu' },
};

function resolveAudience(req) {
  // req.query is populated by Vercel's node runtime; the URL fallback keeps
  // this working anywhere the handler is mounted directly.
  let value = req.query?.for;
  if (value === undefined) {
    value = new URL(req.url, 'http://localhost').searchParams.get('for');
  }
  const raw = String(value || '').toLowerCase().replace(/[.-]/g, '_');
  if (raw === 'airbnb') return AUDIENCES.airbnb;
  if (raw === 'booking_com' || raw === 'booking' || raw === 'bookingcom') return AUDIENCES.booking_com;
  return AUDIENCES.all;
}

module.exports = async (req, res) => {
  const audience = resolveAudience(req);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, checkin, checkout, status, source, hold_expires_at')
    .in('status', ['confirmed', 'pending']);

  if (error) {
    console.error('ical query error', error);
    res.status(500).send('error generating calendar');
    return;
  }

  const now = new Date();
  const blocking = (data || []).filter(
    (b) =>
      (b.status === 'confirmed' ||
        (b.status === 'pending' && b.hold_expires_at && new Date(b.hold_expires_at) > now)) &&
      b.source !== audience.excludeSource
  );

  const stamp = `${toICSDate(now.toISOString().slice(0, 10))}T000000Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Banana Villas Watamu//Booking Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${audience.name}`,
  ];

  for (const b of blocking) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${eventUid(b.id)}@bananavillaswatamu.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toICSDate(b.checkin)}`,
      `DTEND;VALUE=DATE:${toICSDate(b.checkout)}`,
      'SUMMARY:Booked - Banana Villas Watamu',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(lines.join('\r\n'));
};
