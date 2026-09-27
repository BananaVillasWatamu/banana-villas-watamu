const fs = require('fs');
const path = require('path');
const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');
const {
  fetchActivities,
  renderGrid,
  renderFilters,
  renderSchema,
  escapeHtml,
} = require('./_lib/activities');

const templatePath = path.join(__dirname, '..', 'activities.template.html');

const DEFAULTS = {
  title: 'Things to do in Watamu | Banana Villas Watamu',
  description:
    'Snorkelling in the marine park, bike hire, Mida Creek, Gede Ruins and the restaurants we send guests to — what to do around Banana Villas Watamu.',
  ogImage:
    'https://www.bananavillaswatamu.com/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(1).jpg',
};

module.exports = async (req, res) => {
  let settings = null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('site_settings').select('*').eq('id', 1).single();
    settings = data;
  } catch (err) {
    console.error('failed to load site_settings for activities page', err);
  }

  const activities = await fetchActivities();

  let html;
  try {
    html = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    console.error('failed to read activities template', err);
    res.status(500).send('Page temporarily unavailable');
    return;
  }

  html = html
    .split('{{ACTIVITIES_SCHEMA}}').join(renderSchema(activities))
    .split('{{ACTIVITY_FILTERS}}').join(renderFilters(activities))
    .split('{{ACTIVITY_GRID}}').join(renderGrid(activities))
    .split('{{PAGE_TITLE}}').join(escapeHtml(DEFAULTS.title))
    .split('{{PAGE_DESCRIPTION}}').join(escapeHtml(DEFAULTS.description))
    .split('{{OG_IMAGE}}').join(escapeHtml(settings?.og_image_url || DEFAULTS.ogImage));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
