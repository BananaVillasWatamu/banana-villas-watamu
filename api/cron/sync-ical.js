const { isAuthorizedCron } = require('../_lib/cronAuth');
const { syncAllIcal } = require('../_lib/syncIcal');

module.exports = async (req, res) => {
  if (!isAuthorizedCron(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  try {
    const results = await syncAllIcal();
    res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error('sync-ical error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
};
