/**
 * Vite config. Uses relative asset paths (`base: './'`) so the production
 * bundle in `dist/` works equally well from a server OR by double-clicking
 * dist/index.html directly (file:// works because everything is relative
 * and bundled).
 */
export default {
  root: '.',
  base: './',
  server: {
    port: 5173,
    open: true,
    host: 'localhost',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
  },
};
