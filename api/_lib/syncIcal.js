const ical = require('node-ical');
const { getSupabaseAdmin } = require('./supabaseAdmin');

async function syncSource(supabase, url, source) {
  if (!url) return { source, synced: 0, expired: 0, skipped: true };

  const events = await ical.async.fromURL(url);
  const seenUids = [];

  for (const key of Object.keys(events)) {
    const ev = events[key];
    if (ev.type !== 'VEVENT' || !ev.start || !ev.end || !ev.uid) continue;

    const checkin = ev.start.toISOString().slice(0, 10);
    const checkout = ev.end.toISOString().slice(0, 10);
    seenUids.push(ev.uid);

    const { error } = await supabase.from('bookings').upsert(
      {
        external_uid: ev.uid,
        source,
        checkin,
        checkout,
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source,external_uid' }
    );
    if (error) console.error(`upsert failed for ${source} ${ev.uid}`, error);
  }

  // Anything previously synced from this source but no longer in the feed
  // (e.g. cancelled on the other platform) gets freed up.
  const { data: stale } = await supabase
    .from('bookings')
    .select('id, external_uid')
    .eq('source', source)
    .not('external_uid', 'is', null);

  const toExpire = (stale || [])
    .filter((row) => !seenUids.includes(row.external_uid))
    .map((row) => row.id);

  if (toExpire.length > 0) {
    await supabase.from('bookings').update({ status: 'expired' }).in('id', toExpire);
  }

  return { source, synced: seenUids.length, expired: toExpire.length };
}

async function syncAllIcal() {
  const supabase = getSupabaseAdmin();

  // The admin dashboard lets the owner paste their calendar links into
  // site_settings; env vars (AIRBNB_ICAL_URL / BOOKING_ICAL_URL) are kept
  // as a fallback for before that's been set up.
  const { data: settings } = await supabase
    .from('site_settings')
    .select('airbnb_ical_url, booking_ical_url')
    .eq('id', 1)
    .single();

  const airbnbUrl = settings?.airbnb_ical_url || process.env.AIRBNB_ICAL_URL;
  const bookingUrl = settings?.booking_ical_url || process.env.BOOKING_ICAL_URL;

  const results = await Promise.all([
    syncSource(supabase, airbnbUrl, 'airbnb'),
    syncSource(supabase, bookingUrl, 'booking_com'),
  ]);
  return results;
}

module.exports = { syncAllIcal };
