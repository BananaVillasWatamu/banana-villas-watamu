const { buildSitemap, buildLlmsTxt } = require('./_lib/seoFeeds');
const { renderNotFound } = require('./_lib/notFound');

// One function serving three routes — /sitemap.xml, /llms.txt and the
// catch-all 404 — because the Hobby plan allows 12 serverless functions per
// deployment and separate files for each put this project at 13. The rewrites
// in vercel.json pass which one is wanted.
module.exports = async (req, res) => {
  const kind =
    req.query?.kind ??
    new URL(req.url, 'http://localhost').searchParams.get('kind') ??
    'not-found';

  if (kind === 'sitemap') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(await buildSitemap());
    return;
  }

  if (kind === 'llms') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(await buildLlmsTxt());
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(404).send(renderNotFound());
};
