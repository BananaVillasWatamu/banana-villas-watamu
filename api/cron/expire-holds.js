const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { isAuthorizedCron } = require('../_lib/cronAuth');

module.exports = async (req, res) => {
  if (!isAuthorizedCron(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error, count } = await supabase
    .from('bookings')
    .update({ status: 'expired', updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('status', 'pending')
    .lt('hold_expires_at', new Date().toISOString());

  if (error) {
    console.error('expire-holds error', error);
    res.status(500).json({ ok: false, error: 'server_error' });
    return;
  }

  res.status(200).json({ ok: true, expired: count ?? null });
};
