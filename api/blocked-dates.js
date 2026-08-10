const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');

module.exports = async (req, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('bookings')
    .select('checkin, checkout, status, hold_expires_at')
    .in('status', ['confirmed', 'pending']);

  if (error) {
    console.error('blocked-dates query error', error);
    res.status(500).json({ error: 'server_error' });
    return;
  }

  const now = new Date();
  const blocked = (data || [])
    .filter(
      (b) =>
        b.status === 'confirmed' ||
        (b.status === 'pending' && b.hold_expires_at && new Date(b.hold_expires_at) > now)
    )
    .map((b) => ({ checkin: b.checkin, checkout: b.checkout }));

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  res.status(200).json(blocked);
};
