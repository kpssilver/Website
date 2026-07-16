// Vercel serverless function: serves the live sitemap at /sitemap.xml
// (via the rewrite in vercel.json). Edge-cached for an hour so new products
// appear quickly without hammering the database.
import { buildSitemap } from './_lib/sitemap.js';

export default async function handler(req, res) {
  const xml = await buildSitemap(process.env);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.statusCode = 200;
  res.end(xml);
}
