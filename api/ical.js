const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');

function pad(n) {
  return String(n).padStart(2, '0');
}

function toICSDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

module.exports = async (req, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, checkin, checkout, status, hold_expires_at')
    .in('status', ['confirmed', 'pending']);

  if (error) {
    console.error('ical query error', error);
    res.status(500).send('error generating calendar');
    return;
  }

  const now = new Date();
  const blocking = (data || []).filter(
    (b) =>
      b.status === 'confirmed' ||
      (b.status === 'pending' && b.hold_expires_at && new Date(b.hold_expires_at) > now)
  );

  const stamp = `${toICSDate(now.toISOString().slice(0, 10))}T000000Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Banana Villas Watamu//Booking Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];

  for (const b of blocking) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@bananavillaswatamu.com`,
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
