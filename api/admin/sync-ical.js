const { getSupabaseAdmin } = require('../_lib/supabaseAdmin');
const { syncAllIcal } = require('../_lib/syncIcal');

// Same sync as the cron job, but gated on a logged-in Supabase session that
// belongs to an allowlisted admin instead of the cron secret, so the admin
// dashboard can trigger it on demand ("Sync calendars now"). A valid session
// alone is not enough: public signup can hand one to anybody.
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

  // The service-role client bypasses RLS, so check the admins allowlist here
  // the same way is_admin() does for the dashboard's own queries.
  const { data: admin, error: adminError } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError || !admin) {
    res.status(403).json({ ok: false, error: 'forbidden' });
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
