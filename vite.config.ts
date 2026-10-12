import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const mapAssets = fileURLToPath(new URL('./map-assets/src', import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    // map-assets is a git submodule (see README, "Set up"); '@map-assets' is its public API, '@map-assets/<module>' one module
    alias: [
      { find: /^@map-assets$/, replacement: `${mapAssets}/index.ts` },
      { find: /^@map-assets\/(.*)$/, replacement: `${mapAssets}/$1` },
    ],
    // one copy of three.js even if map-assets/ has its own node_modules
    dedupe: ['three'],
  },
  server: { port: 5173, host: '127.0.0.1' },
  build: { chunkSizeWarningLimit: 1200 },
});
