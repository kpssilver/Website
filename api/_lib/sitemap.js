// =============================================================================
// SITEMAP BUILDER — generates sitemap.xml on the fly so newly added products
// show up for Google Search Console without a redeploy.
//
// Static URLs (home, shop, each category) are always included; product URLs
// are pulled live from Supabase (public/anon read) for every in-stock item,
// each stamped with its own <lastmod>. Used by both the Vercel function
// (/api/sitemap) and the Vite dev middleware.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

// Keep in sync with PRODUCT_CATEGORIES in src/data/products.js.
const CATEGORIES = [
  'Pooja Articles',
  'Deities & Singhasans',
  'Gifting Trays',
  'Dinnerware',
  'Home Décor',
  'Clocks & Handbags',
];

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const day = (d) => {
  const t = d ? new Date(d) : new Date();
  return (Number.isNaN(t.getTime()) ? new Date() : t).toISOString().slice(0, 10);
};

export async function buildSitemap(env = {}) {
  const base = String(env.SITE_URL || env.VITE_SITE_URL || 'https://www.kpssilver.com').replace(/\/+$/, '');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const today = day();

  const entries = [
    { loc: `${base}/`, changefreq: 'weekly', priority: '1.0', lastmod: today },
    { loc: `${base}/shop`, changefreq: 'daily', priority: '0.9', lastmod: today },
    ...CATEGORIES.map((c) => ({
      loc: `${base}/shop?category=${encodeURIComponent(c)}`,
      changefreq: 'weekly',
      priority: '0.7',
      lastmod: today,
    })),
  ];

  if (url && key) {
    try {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase
        .from('products')
        .select('id, updated_at, created_at, in_stock')
        .eq('in_stock', true);
      if (!error && Array.isArray(data)) {
        for (const p of data) {
          entries.push({
            loc: `${base}/shop?product=${encodeURIComponent(p.id)}`,
            changefreq: 'weekly',
            priority: '0.6',
            lastmod: day(p.updated_at || p.created_at),
          });
        }
      }
    } catch {
      // Supabase unreachable — fall back to the static URLs above.
    }
  }

  const body = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
