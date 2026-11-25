import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  base: '/',
  build: { outDir: fileURLToPath(new URL('./dist-pilot', import.meta.url)) },
});
