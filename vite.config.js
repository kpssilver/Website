import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { createOrder, verifyPayment } from './api/_lib/razorpay.js';
import { handleStaffAction } from './api/_lib/staff.js';
import { readSupabaseEnv } from './api/_lib/supabaseAdmin.js';
import { buildSitemap } from './api/_lib/sitemap.js';

// Local parity for the Vercel serverless functions: this middleware serves the
// /api/* endpoints during `npm run dev` so the Razorpay and staff-management
// flows can be tested without the Vercel CLI. In production these same handlers
// run as the functions in /api. Secrets (KEY_SECRET, service_role) stay
// server-side and are never bundled into client code.
function devApi(env) {
  const razorpayCfg = { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
  const supaEnv = readSupabaseEnv(env);
  const readBody = (req) =>
    new Promise((res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try {
          res(JSON.parse(raw || '{}'));
        } catch {
          res({});
        }
      });
      req.on('error', () => res({}));
    });

  const send = (res, result) => {
    res.statusCode = result.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result.body));
  };

  return {
    name: 'kps-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];

        // Live sitemap parity with production (/sitemap.xml -> generated XML).
        if (url === '/sitemap.xml') {
          const xml = await buildSitemap(env);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          return res.end(xml);
        }

        const isRazorpay = url === '/api/create-order' || url === '/api/verify-payment';
        const staffMatch = url.match(/^\/api\/staff\/([a-z-]+)$/);
        if (!isRazorpay && !staffMatch) return next();

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Allow', 'POST');
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Method not allowed.' }));
        }

        const body = await readBody(req);
        if (isRazorpay) {
          const result =
            url === '/api/create-order' ? await createOrder(body, razorpayCfg) : verifyPayment(body, razorpayCfg);
          return send(res, result);
        }
        const result = await handleStaffAction(staffMatch[1], body, req.headers.authorization, supaEnv);
        return send(res, result);
      });
    },
  };
}

// Dev-only: map clean URLs to their .html entry so `npm run dev` matches the
// production routing (Vercel handles this via `cleanUrls` in vercel.json).
const CLEAN_ROUTES = ['landing', 'shop', 'admin', 'staff'];
function cleanUrlRoutes() {
  return {
    name: 'kps-clean-url-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [path, query] = (req.url || '').split('?');
        const name = path.replace(/^\/|\/$/g, '');
        if (CLEAN_ROUTES.includes(name)) {
          req.url = `/${name}.html` + (query ? `?${query}` : '');
        }
        next();
      });
    },
  };
}

// Vite gives us instant hot-module-reload in dev and an optimized static
// build for production. When this grows into a storefront, this is also
// where routing/SSR plugins, env vars and API proxies would be configured.
export default defineConfig(({ mode }) => {
  // Load all env vars (incl. non-VITE_ server secrets) for the dev middleware.
  // Only VITE_-prefixed vars are ever exposed to client code by Vite.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    root: '.',
    publicDir: 'public',
    plugins: [devApi(env), cleanUrlRoutes()],
    server: {
      port: 5173,
      open: true,
    },
    build: {
      outDir: 'dist',
      target: 'es2019',
      rollupOptions: {
        // Multi-page build: landing page, the storefront and the admin dashboard.
        input: {
          main: resolve(__dirname, 'index.html'),
          shop: resolve(__dirname, 'shop.html'),
          admin: resolve(__dirname, 'admin.html'),
          staff: resolve(__dirname, 'staff.html'),
          landing: resolve(__dirname, 'landing.html'),
        },
      },
    },
  };
});
