import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite config — multi-page. Relative base so the build works on GitHub
 * Pages (project subpath), a static host, or opened via a local server.
 */
export default {
  root: '.',
  base: './',
  server: { port: 5173, open: true, host: 'localhost' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'index.html'),
        projects:   resolve(__dirname, 'projects.html'),
        experience: resolve(__dirname, 'experience.html'),
        contact:    resolve(__dirname, 'contact.html'),
      },
    },
  },
};
