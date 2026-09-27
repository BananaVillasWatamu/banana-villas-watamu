// The sitemap and llms.txt bodies.
//
// Both live here rather than in their own route files because Vercel's Hobby
// plan allows 12 serverless functions per deployment and this project was at
// 13 — /api/seo.js now serves both of these plus the 404, which brings it
// back under the limit. Nothing about the output changed.

const { getSupabaseAdmin } = require('./supabaseAdmin');

const SITE = 'https://www.bananavillaswatamu.com';

function day(value, fallback) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return fallback;
  return d.toISOString().slice(0, 10);
}

function xml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Generated rather than checked in: a static file would go stale the moment
// an activity is published, and lastmod dates that are simply "today" every
// day are worth nothing to a crawler. These come from the rows themselves.
async function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  let activities = [];
  let settingsUpdated = null;

  try {
    const supabase = getSupabaseAdmin();

    const [activityResult, settingsResult] = await Promise.all([
      supabase
        .from('activities')
        .select('slug, title, image_url, updated_at')
        .eq('published', true)
        .not('slug', 'is', null)
        .order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('updated_at').eq('id', 1).single(),
    ]);

    if (!activityResult.error) activities = activityResult.data || [];
    settingsUpdated = settingsResult.data?.updated_at || null;
  } catch (err) {
    console.error('sitemap query failed', err);
  }

  // The most recent edit anywhere is the honest answer for the pages that
  // show that content.
  const newestActivity = activities.reduce(
    (latest, a) => (a.updated_at && a.updated_at > latest ? a.updated_at : latest),
    ''
  );
  const homeLastmod = day(settingsUpdated || newestActivity, today);
  const listLastmod = day(newestActivity || settingsUpdated, today);

  const entries = [
    { loc: `${SITE}/`, lastmod: homeLastmod, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE}/activities`, lastmod: listLastmod, changefreq: 'weekly', priority: '0.8' },
    ...activities.map((a) => ({
      loc: `${SITE}/activities/${encodeURIComponent(a.slug)}`,
      lastmod: day(a.updated_at, today),
      changefreq: 'monthly',
      priority: '0.6',
      image: a.image_url ? { url: a.image_url, title: a.title } : null,
    })),
  ];

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...entries.map((e) => {
      const image = e.image
        ? `\n    <image:image>\n      <image:loc>${xml(e.image.url)}</image:loc>\n` +
          `      <image:title>${xml(e.image.title)}</image:title>\n    </image:image>`
        : '';
      return (
        `  <url>\n    <loc>${xml(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>${image}\n  </url>`
      );
    }),
    '</urlset>',
  ].join('\n');

  return body;
}






// llms.txt, generated so the activity list can't drift from what is actually
// published. Same reasoning as the sitemap: a hand-maintained file is wrong
// the first time someone adds an activity and forgets to edit it.
async function buildLlmsTxt() {
  let activities = [];
  let faqs = [];

  try {
    const supabase = getSupabaseAdmin();
    const [activityResult, faqResult] = await Promise.all([
      supabase
        .from('activities')
        .select('title, slug, category, summary, we_arrange, kid_friendly')
        .eq('published', true)
        .not('slug', 'is', null)
        .order('sort_order', { ascending: true }),
      supabase
        .from('faqs')
        .select('question, answer')
        .eq('published', true)
        .order('sort_order', { ascending: true })
        .limit(8),
    ]);
    if (!activityResult.error) activities = activityResult.data || [];
    if (!faqResult.error) faqs = faqResult.data || [];
  } catch (err) {
    console.error('llms.txt query failed', err);
  }

  const lines = [
    '# Banana Villas Watamu',
    '',
    '> Luxury 3-bedroom villa with a private oasis-style swimming pool, beach access, and tropical gardens in Watamu, Kenya. Bookable directly or via Airbnb/Booking.com.',
    '',
    '## Key facts',
    '- Location: Plot 442 Turtle Bay Road, Watamu, Kilifi County, Kenya',
    '- Sleeps up to 8 guests comfortably across 3 bedrooms (bookings accepted for up to 10 guests)',
    '- Amenities: private pool, high-speed WiFi, air conditioning, fully equipped kitchen, backup generator, secure parking, BBQ grill, beach access; private chef and airport transfer available on request',
    '- Nearest airports: Malindi (MYD), ~20 min drive; Mombasa (MBA), ~1.5-2 hr drive',
    '- Contact: contact@bananavillaswatamu.com, WhatsApp/phone +254 715 257 111',
    `- Map: ${SITE}/#location`,
    '',
    '## Booking',
    `- Direct request: ${SITE}/#contact`,
    '- Airbnb: https://www.airbnb.com/rooms/1244860553597616148',
    '- Booking.com: https://www.booking.com/hotel/ke/banana-house-villas-watamu.html',
    '- Direct requests are held for 48 hours while availability is confirmed. Availability syncs both ways with Airbnb and Booking.com.',
    '',
    '## Pages',
    `- [Homepage](${SITE}/): gallery, amenities, guest reviews, getting-here info, FAQ, and the booking request form.`,
    `- [Things to do in Watamu](${SITE}/activities): what there is to do around the villa, filterable by type and by what suits children.`,
  ];

  if (activities.length > 0) {
    lines.push('');
    lines.push('## Things to do');
    lines.push('No prices are published for activities. Guests ask and the villa arranges what it can.');
    lines.push('');
    for (const a of activities) {
      const tags = [
        a.category,
        a.we_arrange ? 'arranged by the villa' : 'recommended nearby',
        a.kid_friendly ? 'good with kids' : null,
      ]
        .filter(Boolean)
        .join('; ');
      lines.push(`- [${a.title}](${SITE}/activities/${a.slug}): ${a.summary || ''} (${tags})`);
    }
  }

  if (faqs.length > 0) {
    lines.push('');
    lines.push('## Common questions');
    for (const f of faqs) {
      const answer = String(f.answer || '').replace(/\s+/g, ' ').trim();
      lines.push(`- **${f.question}** ${answer}`);
    }
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('- This file is generated from the site content, so it reflects what is published right now.');
  lines.push(`- Last generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  return lines.join('\n');
}


module.exports = { buildSitemap, buildLlmsTxt };
