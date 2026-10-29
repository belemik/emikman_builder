import { defineConfig } from 'vite';

// Separate output prevents a public demo from replacing the authenticated app.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/emikman_builder/' : '/',
  build: { outDir: mode === 'server' ? 'dist-server' : 'dist' },
}));
