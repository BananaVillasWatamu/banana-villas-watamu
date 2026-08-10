const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');

const MAX_GUESTS = 10;
const MAX_NAME_LEN = 200;
const MAX_EMAIL_LEN = 200;
const MAX_PHONE_LEN = 40;
const MAX_NOTES_LEN = 4000;
const MAX_DAYS_AHEAD = 730; // 2 years — keeps far-future spam from piling up

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,40}$/;

// Coarse abuse guard: block a single source IP from creating more than a
// handful of pending holds per hour. This is a heuristic, not a hard
// security boundary — see created_ip's usage below and the note in
// supabase/schema.sql about locking down direct RPC access.
const RATE_LIMIT_WINDOW_HOURS = 1;
const RATE_LIMIT_MAX_REQUESTS = 5;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const checkin = typeof body.checkin === 'string' ? body.checkin : '';
  const checkout = typeof body.checkout === 'string' ? body.checkout : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const adults = body.adults ? parseInt(body.adults, 10) : null;
  const kids = body.kids ? parseInt(body.kids, 10) : null;

  if (!checkin || !checkout || !name || !phone) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }

  if (
    name.length > MAX_NAME_LEN ||
    email.length > MAX_EMAIL_LEN ||
    phone.length > MAX_PHONE_LEN ||
    notes.length > MAX_NOTES_LEN
  ) {
    res.status(400).json({ ok: false, error: 'field_too_long' });
    return;
  }

  if (email && !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'invalid_email' });
    return;
  }

  if (!PHONE_RE.test(phone)) {
    res.status(400).json({ ok: false, error: 'invalid_phone' });
    return;
  }

  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + MAX_DAYS_AHEAD);

  if (
    Number.isNaN(checkinDate.getTime()) ||
    Number.isNaN(checkoutDate.getTime()) ||
    checkoutDate <= checkinDate ||
    checkinDate < today ||
    checkinDate > maxDate
  ) {
    res.status(400).json({ ok: false, error: 'invalid_dates' });
    return;
  }

  if ((adults || 0) + (kids || 0) > MAX_GUESTS) {
    res.status(400).json({ ok: false, error: 'too_many_guests' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const clientIp = getClientIp(req);

  if (clientIp) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 3600000).toISOString();
    const { count, error: rateError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('created_ip', clientIp)
      .gte('created_at', since);

    if (!rateError && count !== null && count >= RATE_LIMIT_MAX_REQUESTS) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }
  }

  const { data, error } = await supabase.rpc('request_booking', {
    p_checkin: checkin,
    p_checkout: checkout,
    p_name: name,
    p_email: email || null,
    p_phone: phone,
    p_adults: adults,
    p_kids: kids,
    p_notes: notes || null,
  });

  if (error) {
    console.error('request_booking error', error);
    res.status(500).json({ ok: false, error: 'server_error' });
    return;
  }

  if (data?.ok && data.id && clientIp) {
    // Tag the row for the rate-limit check above. Awaited (not
    // fire-and-forget) since a serverless function's process can be frozen
    // the moment the response is sent, which would drop an unawaited call.
    const { error: tagError } = await supabase
      .from('bookings')
      .update({ created_ip: clientIp })
      .eq('id', data.id);
    if (tagError) console.error('failed to tag booking with created_ip', tagError);
  }

  res.status(200).json(data);
};
