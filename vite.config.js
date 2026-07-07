import { defineConfig } from 'vite';

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
  },
});
