// Enquiry log for the public booking form.
//
// The booking table only ever gets a row when the dates are actually free,
// which means a guest whose dates were taken — or who skipped straight to
// WhatsApp with half the form filled in — used to vanish without a trace.
// Every submission is recorded here instead, so the owner always has the
// lead even when no hold was created.

const MAX_NAME_LEN = 200;
const MAX_EMAIL_LEN = 200;
const MAX_PHONE_LEN = 40;
const MAX_NOTES_LEN = 4000;

// Coarser than the booking rate limit: an enquiry row is cheap and losing a
// genuine lead is expensive, so the cap only exists to stop a flood from
// filling the table.
const RATE_LIMIT_WINDOW_HOURS = 1;
const RATE_LIMIT_MAX_ENQUIRIES = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

function str(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function date(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function int(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}

// Normalises whatever the form sent into a row shape. Deliberately lenient:
// anything unparseable becomes null rather than rejecting the enquiry.
function normaliseEnquiry(body) {
  return {
    guest_name: str(body.name ?? body.guest_name, MAX_NAME_LEN),
    email: str(body.email, MAX_EMAIL_LEN),
    phone: str(body.phone, MAX_PHONE_LEN),
    checkin: date(body.checkin),
    checkout: date(body.checkout),
    adults: int(body.adults, 0, 99),
    kids: int(body.kids, 0, 99),
    notes: str(body.notes ?? body.message, MAX_NOTES_LEN),
    // Only set when the request came from an activity page.
    activity: str(body.activity, 160),
    activity_date: date(body.activity_date),
    transfer: body.transfer === true || body.transfer === 'true',
    channel: body.channel === 'whatsapp' ? 'whatsapp' : 'form',
  };
}

// Best-effort insert: never throws, never blocks the caller's response. A
// failure here must not cost the guest their booking.
async function recordEnquiry(supabase, { body, outcome, bookingId = null, ip = null }) {
  try {
    const row = normaliseEnquiry(body || {});

    // A completely empty submission carries no lead worth keeping. An
    // activity request counts as content in itself.
    if (!row.guest_name && !row.phone && !row.email && !row.notes && !row.activity) return null;

    if (ip) {
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 3600000).toISOString();
      const { count, error: countError } = await supabase
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .eq('created_ip', ip)
        .gte('created_at', since);
      if (!countError && count !== null && count >= RATE_LIMIT_MAX_ENQUIRIES) return null;
    }

    const { data, error } = await supabase
      .from('enquiries')
      .insert({ ...row, outcome, booking_id: bookingId, created_ip: ip })
      .select('id')
      .single();

    if (error) {
      console.error('failed to record enquiry', error);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.error('failed to record enquiry', err);
    return null;
  }
}

module.exports = { recordEnquiry, normaliseEnquiry, getClientIp };
