const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const { recordEnquiry, getClientIp } = require('./_lib/enquiries');

// Lenient capture endpoint used by the "message us on WhatsApp" path.
//
// /api/bookings already logs an enquiry for every request that reaches it,
// but it refuses anything that isn't a complete, valid booking request. A
// guest who fills in half the form and taps through to WhatsApp is still a
// lead, so this endpoint saves whatever they typed and always answers ok —
// the guest must never be held up on their way to the chat.
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

  try {
    const supabase = getSupabaseAdmin();
    await recordEnquiry(supabase, {
      body,
      outcome: typeof body.outcome === 'string' ? body.outcome.slice(0, 40) : 'whatsapp_only',
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error('enquiry capture failed', err);
  }

  res.status(200).json({ ok: true });
};
