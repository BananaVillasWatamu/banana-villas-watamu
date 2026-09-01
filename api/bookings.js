const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { recordEnquiry, getClientIp } = require('./_lib/enquiries');

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

  const supabase = getSupabaseAdmin();
  const clientIp = getClientIp(req);

  // Every submission that reaches this endpoint is logged as an enquiry,
  // whatever happens to it — a guest whose dates are already taken is still
  // a lead worth following up, and they often continue the conversation on
  // WhatsApp regardless of what this endpoint answers.
  const reject = async (status, error, outcome) => {
    await recordEnquiry(supabase, { body, outcome, ip: clientIp });
    res.status(status).json({ ok: false, error });
  };

  const checkin = typeof body.checkin === 'string' ? body.checkin : '';
  const checkout = typeof body.checkout === 'string' ? body.checkout : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const adults = body.adults ? parseInt(body.adults, 10) : null;
  const kids = body.kids ? parseInt(body.kids, 10) : null;

  if (!checkin || !checkout || !name || !phone) {
    await reject(400, 'missing_fields', 'invalid');
    return;
  }

  if (
    name.length > MAX_NAME_LEN ||
    email.length > MAX_EMAIL_LEN ||
    phone.length > MAX_PHONE_LEN ||
    notes.length > MAX_NOTES_LEN
  ) {
    await reject(400, 'field_too_long', 'invalid');
    return;
  }

  if (email && !EMAIL_RE.test(email)) {
    await reject(400, 'invalid_email', 'invalid');
    return;
  }

  if (!PHONE_RE.test(phone)) {
    await reject(400, 'invalid_phone', 'invalid');
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
    await reject(400, 'invalid_dates', 'invalid');
    return;
  }

  if ((adults || 0) + (kids || 0) > MAX_GUESTS) {
    await reject(400, 'too_many_guests', 'invalid');
    return;
  }

  if (clientIp) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 3600000).toISOString();
    const { count, error: rateError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('created_ip', clientIp)
      .gte('created_at', since);

    if (!rateError && count !== null && count >= RATE_LIMIT_MAX_REQUESTS) {
      await reject(429, 'rate_limited', 'rate_limited');
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
    await reject(500, 'server_error', 'error');
    return;
  }

  await recordEnquiry(supabase, {
    body,
    outcome: data?.ok ? 'requested' : 'unavailable',
    bookingId: data?.ok ? data.id || null : null,
    ip: clientIp,
  });

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
