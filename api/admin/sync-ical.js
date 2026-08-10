const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { syncAllIcal } = require('../_lib/syncIcal');

// Same sync as the cron job, but gated on a valid logged-in Supabase
// session instead of the cron secret, so the admin dashboard can trigger it
// on demand ("Sync calendars now").
module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  try {
    const results = await syncAllIcal();
    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('admin sync-ical error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};
