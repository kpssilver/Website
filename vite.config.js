import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite gives us instant hot-module-reload in dev and an optimized static
// build for production. When this grows into a storefront, this is also
// where routing/SSR plugins, env vars and API proxies would be configured.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2019',
    rollupOptions: {
      // Multi-page build: the public landing page + the private admin dashboard.
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
