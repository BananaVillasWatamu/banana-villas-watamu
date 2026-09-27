// Activity cards, rendered to HTML on the server.
//
// The gallery, reviews and FAQs on the homepage are fetched in the browser,
// which is fine — nobody finds this villa by searching for its FAQ. The
// activities page is the opposite: ranking for "things to do in Watamu" is
// the whole reason it exists, so its content goes into the HTML before it
// leaves the server. The filter chips on the page only hide and show cards
// that are already there.

const { getSupabaseAdmin } = require('./supabaseAdmin');

// Fixed order so the page reads the same way every time, whatever order the
// rows happen to come back in. Anything with an unlisted category falls to
// the end under its own heading.
const CATEGORY_ORDER = ['Beach', 'Watersports', 'Bike Hire', 'Excursions', 'Restaurants'];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Supabase public URLs arrive percent-encoded already, so this escapes only
// what would break out of an attribute — encodeURI would double-encode them.
function safeUrl(url) {
  return escapeHtml(url || '');
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchActivities({ featuredOnly = false, limit = null } = {}) {
  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('activities')
      .select('id, title, slug, category, summary, description, image_url, og_image_url, seo_title, seo_description, we_arrange, kid_friendly, distance_text, duration_text, featured')
      .eq('published', true)
      .order('sort_order', { ascending: true });

    if (featuredOnly) query = query.eq('featured', true);
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) {
      console.error('activities query failed', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('activities query threw', err);
    return [];
  }
}

async function fetchActivityBySlug(slug) {
  if (!slug) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('published', true)
      .eq('slug', slug)
      .maybeSingle();
    if (error) {
      console.error('activity lookup failed', error);
      return null;
    }
    return data || null;
  } catch (err) {
    console.error('activity lookup threw', err);
    return null;
  }
}

// Everything published that has a page of its own, for the sitemap.
async function fetchActivitySlugs() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('activities')
      .select('slug, updated_at')
      .eq('published', true)
      .not('slug', 'is', null);
    if (error) return [];
    return data || [];
  } catch (err) {
    return [];
  }
}

// The enquiry link carries the activity name through to the booking form,
// which prefills the message and files it in the Enquiries tab — so the
// owner can see which activities guests actually ask about.
function enquiryHref(activity, { fromActivitiesPage }) {
  const base = fromActivitiesPage ? '/' : '';
  return `${base}?activity=${encodeURIComponent(activity.title)}#contact`;
}

function metaLine(activity) {
  const bits = [];
  if (activity.distance_text) bits.push(escapeHtml(activity.distance_text));
  if (activity.duration_text) bits.push(escapeHtml(activity.duration_text));
  return bits.length ? `<p class="activity-meta">${bits.join(' · ')}</p>` : '';
}

function card(activity, options = {}) {
  const { fromActivitiesPage = true } = options;
  const image = activity.image_url
    ? `<img src="${safeUrl(activity.image_url)}" alt="${escapeHtml(activity.title)}" loading="lazy">`
    : '<div class="activity-photo-empty" aria-hidden="true"></div>';

  // we_arrange is the whole difference between something the villa can book
  // and something it merely recommends. A recommendation gets no button at
  // all — there is nothing to ask about the beach, and a card full of dead
  // calls to action teaches guests to ignore the live ones.
  const badges = [
    activity.we_arrange ? '<span class="activity-badge">We can arrange this</span>' : '',
    activity.kid_friendly ? '<span class="activity-badge activity-badge-kids">Good with kids</span>' : '',
  ].join('');

  const readMore = activity.slug
    ? `<a class="activity-more" href="/activities/${escapeHtml(activity.slug)}">Read more</a>`
    : '';

  // Straight to the request form on the activity's own page, where the
  // relevant questions are, rather than to the villa's contact form.
  const cta = activity.we_arrange && activity.slug
    ? `<a class="btn-platform activity-cta" href="/activities/${escapeHtml(activity.slug)}#book">Book through us</a>`
    : '';

  return `
                <article class="activity-card" data-category="${escapeHtml(activity.category)}"
                         data-kid-friendly="${activity.kid_friendly ? 'true' : 'false'}">
                    <div class="activity-photo">${image}</div>
                    <div class="activity-body">
                        <span class="activity-category">${escapeHtml(activity.category)}</span>
                        <h3>${activity.slug
                            ? `<a href="/activities/${escapeHtml(activity.slug)}">${escapeHtml(activity.title)}</a>`
                            : escapeHtml(activity.title)}</h3>
                        ${metaLine(activity)}
                        <p class="activity-summary">${escapeHtml(activity.summary)}</p>
                        <div class="activity-actions">
                            ${badges}
                            ${readMore}
                            ${cta}
                        </div>
                    </div>
                </article>`;
}

function renderFilters(activities) {
  const present = [...new Set(activities.map((a) => a.category))].sort(
    (a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }
  );

  if (present.length < 2) return '';

  const chips = present
    .map(
      (c) =>
        `<button type="button" class="activity-chip" data-filter="${escapeHtml(c)}" id="chip-${slug(c)}">${escapeHtml(c)}</button>`
    )
    .join('\n                    ');

  // Kid-friendly sits at the end of the same row and behaves like the other
  // chips — one selection at a time. Crossing it with a category would mean a
  // two-axis filter UI, which is more machinery than a list this size needs.
  const kidChip = activities.some((a) => a.kid_friendly)
    ? '\n                    <button type="button" class="activity-chip activity-chip-kids" data-filter="kid-friendly">Good with kids</button>'
    : '';

  return `
                <div class="activity-filters" role="group" aria-label="Filter activities">
                    <button type="button" class="activity-chip active" data-filter="all">All</button>
                    ${chips}${kidChip}
                </div>`;
}

function renderGrid(activities) {
  if (activities.length === 0) {
    return `
                <p class="activity-empty">We're putting this together — ask us what you'd like to do and we'll
                    point you in the right direction.</p>`;
  }
  return `
            <div class="activity-grid" id="activityGrid">${activities.map((a) => card(a)).join('')}
            </div>`;
}

// ItemList of the things on the page. Deliberately no Offer/price markup:
// Google treats a marked-up price as a promise, and these are other people's
// businesses.
function renderSchema(activities) {
  if (activities.length === 0) return '{}';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Things to do in Watamu',
    itemListElement: activities.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'TouristAttraction',
        name: a.title,
        description: a.summary || a.description || undefined,
        image: a.image_url || undefined,
      },
    })),
  };
  return JSON.stringify(schema, null, 2).replace(/</g, '\\u003c');
}

// The whole homepage section, or nothing at all when no activity is
// featured — better an absent section than an empty shelf.
function renderTeaser(activities) {
  if (activities.length === 0) return '';
  const cards = activities
    .map((a) => card(a, { fromActivitiesPage: false }))
    .join('');

  return `        <section id="activities" class="section">
            <div class="container">
                <div class="section-header fade-up">
                    <h2>Things to do in Watamu</h2>
                    <p>The beach, the marine park and everything else within reach of the villa.</p>
                </div>
            <div class="activity-grid activity-grid-teaser">${cards}
            </div>
                <div class="activities-cta">
                    <a href="/activities" class="btn-platform activity-see-all">See all activities</a>
                </div>
            </div>
        </section>`;
}

module.exports = {
  card,
  fetchActivities,
  fetchActivityBySlug,
  fetchActivitySlugs,
  CATEGORY_ORDER,
  renderGrid,
  renderFilters,
  renderSchema,
  renderTeaser,
  escapeHtml,
};
