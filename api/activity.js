const fs = require('fs');
const path = require('path');
const {
  fetchActivityBySlug,
  fetchActivities,
  card,
  escapeHtml,
} = require('./_lib/activities');
const { renderNotFound } = require('./_lib/notFound');

const templatePath = path.join(__dirname, '..', 'activity.template.html');
const SITE = 'https://www.bananavillaswatamu.com';
const WHATSAPP = 'https://wa.me/254715257111';
const FALLBACK_OG = `${SITE}/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(1).jpg`;

// A page with two lines on it competes with the listing page and wins nothing.
// Below this, the page still works for anyone who follows a link — it just
// asks not to be indexed until there's something worth indexing.
const THIN_CONTENT_CHARS = 200;

function paragraphs(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  return clean
    .split(/\n\s*\n/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n                    ');
}

function buildSchema(activity, canonical, ogImage) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: activity.title,
    description: activity.seo_description || activity.summary || undefined,
    url: canonical,
    image: ogImage || undefined,
    touristType: activity.kid_friendly ? 'Family' : undefined,
    isAccessibleForFree: undefined,
    containedInPlace: {
      '@type': 'Place',
      name: 'Watamu',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Watamu',
        addressRegion: 'Kilifi County',
        addressCountry: 'KE',
      },
    },
  };
  return JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
}

module.exports = async (req, res) => {
  const slugParam =
    req.query?.slug ??
    new URL(req.url, 'http://localhost').searchParams.get('slug') ??
    '';
  const slug = String(slugParam).toLowerCase().replace(/[^a-z0-9-]/g, '');

  const activity = await fetchActivityBySlug(slug);

  if (!activity) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(404).send(renderNotFound({
      heading: "We can't find that activity",
      message: 'It may have been renamed or taken down. Here is everything else there is to do in Watamu.',
    }));
    return;
  }

  let html;
  try {
    html = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    console.error('failed to read activity template', err);
    res.status(500).send('Page temporarily unavailable');
    return;
  }

  const canonical = `${SITE}/activities/${activity.slug}`;
  const ogImage = activity.og_image_url || activity.image_url || FALLBACK_OG;
  const seoTitle = activity.seo_title || `${activity.title} | Things to do in Watamu`;
  const seoDescription =
    activity.seo_description ||
    activity.summary ||
    `${activity.title} — one of the things to do near Banana Villas Watamu.`;

  const bodyText = activity.description || activity.summary || '';
  const thin = bodyText.trim().length < THIN_CONTENT_CHARS;

  const metaBits = [activity.distance_text, activity.duration_text].filter(Boolean);
  const metaLine = metaBits.length
    ? `<p class="activity-meta">${metaBits.map(escapeHtml).join(' · ')}</p>`
    : '';

  const badges = [
    activity.we_arrange ? '<span class="activity-badge">We can arrange this</span>' : '',
    activity.kid_friendly ? '<span class="activity-badge activity-badge-kids">Good with kids</span>' : '',
  ].join('');

  const heroImage = activity.image_url
    ? `<div class="activity-detail-photo"><img src="${escapeHtml(activity.image_url)}" alt="${escapeHtml(activity.title)}"></div>`
    : '';

  // A few other things to do, as cards rather than a list of links — this is
  // the row most likely to carry a reader on to a second page.
  const siblings = (await fetchActivities()).filter((a) => a.slug && a.slug !== activity.slug);
  const sameCategory = siblings.filter((a) => a.category === activity.category);
  const others = siblings.filter((a) => a.category !== activity.category);
  // Nearest first: the same sort of thing, then whatever else there is.
  const picks = [...sameCategory, ...others].slice(0, 3);

  const related = picks.length
    ? `<section class="activity-related">
                    <h2>More things to do</h2>
                    <div class="activity-grid activity-grid-related">${picks.map((a) => card(a)).join('')}
                    </div>
                    <p class="activity-related-all"><a class="activity-more" href="/activities">See all activities</a></p>
                </section>`
    : '';

  // Something the villa arranges gets a booking CTA. A plain recommendation
  // gets a nudge about the villa itself instead — still not a dead end, but
  // it doesn't pretend you can book a public beach.
  const ctaBlock = activity.we_arrange
    ? `<div class="activity-detail-cta glass-card">
                    <h2>Want us to arrange it?</h2>
                    <p>Send us your dates and we'll sort the details — we can book this alongside your stay.</p>
                    <div class="activities-cta">
                        <a href="/?activity=${encodeURIComponent(activity.title)}#contact" class="btn-primary btn-cta">Book through us <span aria-hidden="true">&rarr;</span></a>
                        <p class="form-actions-alt">Or message us directly on
                            <a class="link-whatsapp" href="${WHATSAPP}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                        </p>
                    </div>
                </div>`
    : `<div class="activity-detail-cta activity-detail-cta-soft">
                    <p>No booking needed for this one — it's simply somewhere we'd send you.
                        <a href="/#contact">Staying with us?</a> Send your dates and we'll help you plan the rest.</p>
                </div>`;

  html = html
    .split('{{ACTIVITY_SCHEMA}}').join(buildSchema(activity, canonical, ogImage))
    .split('{{SEO_TITLE}}').join(escapeHtml(seoTitle))
    .split('{{SEO_DESCRIPTION}}').join(escapeHtml(seoDescription))
    .split('{{OG_TITLE}}').join(escapeHtml(activity.seo_title || activity.title))
    .split('{{OG_IMAGE}}').join(escapeHtml(ogImage))
    .split('{{CANONICAL}}').join(escapeHtml(canonical))
    .split('{{ROBOTS}}').join(thin ? 'noindex, follow' : 'index, follow')
    .split('{{TITLE}}').join(escapeHtml(activity.title))
    .split('{{CATEGORY}}').join(escapeHtml(activity.category))
    .split('{{META_LINE}}').join(metaLine)
    .split('{{BADGES}}').join(badges ? `<div class="activity-detail-badges">${badges}</div>` : '')
    .split('{{HERO_IMAGE}}').join(heroImage)
    .split('{{BODY}}').join(paragraphs(bodyText) || `<p>${escapeHtml(activity.summary || '')}</p>`)
    .split('{{CTA_BLOCK}}').join(ctaBlock)
    .split('{{RELATED}}').join(related);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
