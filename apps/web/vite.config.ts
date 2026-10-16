import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const chiaroDir = fileURLToPath(new URL('../../design-system/chiaro/', import.meta.url));

// Versão única do produto: o `version` do package.json da raiz.
const rootPackage = JSON.parse(readFileSync(`${rootDir}package.json`, 'utf8')) as { version: string };
export const appVersion = rootPackage.version;

export default defineConfig({
  // GitHub Pages serve em /cronograma-audiovisual/; o build do desktop passa VITE_BASE=./ (ADR-008).
  base: process.env.VITE_BASE ?? '/cronograma-audiovisual/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@chiaro': chiaroDir,
    },
  },
  server: {
    fs: {
      allow: [rootDir],
    },
  },
});
