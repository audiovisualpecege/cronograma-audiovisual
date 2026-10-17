import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const chiaroDir = fileURLToPath(new URL('../../design-system/chiaro/', import.meta.url));

// Versão única do produto: o `version` do package.json da raiz.
const rootPackage = JSON.parse(readFileSync(`${rootDir}package.json`, 'utf8')) as { version: string };
export const appVersion = rootPackage.version;

// Tema Noite (bloco [data-theme="noite"] de design-system/chiaro/tokens/colors.css): onde o CSS não chega,
// como a tela de abertura do app instalado.
export const NOITE = '#070010';

export default defineConfig({
  // GitHub Pages serve em /cronograma-audiovisual/; o build do desktop passa VITE_BASE=./ (ADR-008).
  base: process.env.VITE_BASE ?? '/cronograma-audiovisual/',
  plugins: [
    react(),
    // App instalável: manifesto, service worker com o shell guardado e notificações (ADR-008).
    VitePWA({
      disable: Boolean(process.env.VITEST),
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      manifestFilename: 'manifest.webmanifest',
      // Os ícones já entram pelo globPatterns do shell.
      includeManifestIcons: false,
      manifest: {
        id: './',
        name: 'Cronograma Audiovisual',
        short_name: 'Cronograma',
        description: 'Escala da equipe de audiovisual: minha semana, equipe e avisos. Um produto Chiaro Filmes.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: NOITE,
        theme_color: NOITE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,ttf,otf,webmanifest}'],
        // As fontes Altivo e Archivo entram no shell para abrir sem internet.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
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
