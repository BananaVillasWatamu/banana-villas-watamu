const fs = require('fs');
const path = require('path');
const { getSupabaseAdmin } = require('./_lib/supabaseAdmin');

const templatePath = path.join(__dirname, '..', 'home.template.html');

const DEFAULTS = {
  seo_title: 'Banana Villas Watamu | Your Vacation Starts Here',
  seo_description:
    'Experience luxury and nature at Banana Villas Watamu. A premium villa with a stunning oasis-style swimming pool and modern architecture.',
  og_image_url:
    'https://www.bananavillaswatamu.com/images/Banana%20Villas%20Watamu%20Photo%20-%20%20(1).jpg',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  let settings = null;

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('site_settings').select('*').eq('id', 1).single();
    settings = data;
  } catch (err) {
    console.error('failed to load site_settings, falling back to defaults', err);
  }

  const title = settings?.seo_title || DEFAULTS.seo_title;
  const description = settings?.seo_description || DEFAULTS.seo_description;
  const ogTitle = settings?.og_title || title;
  const ogDescription = settings?.og_description || description;
  const ogImage = settings?.og_image_url || DEFAULTS.og_image_url;

  let html;
  try {
    html = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    console.error('failed to read home template', err);
    res.status(500).send('Site temporarily unavailable');
    return;
  }

  html = html
    .split('{{SEO_TITLE}}').join(escapeHtml(title))
    .split('{{SEO_DESCRIPTION}}').join(escapeHtml(description))
    .split('{{OG_TITLE}}').join(escapeHtml(ogTitle))
    .split('{{OG_DESCRIPTION}}').join(escapeHtml(ogDescription))
    .split('{{OG_IMAGE}}').join(escapeHtml(ogImage));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
