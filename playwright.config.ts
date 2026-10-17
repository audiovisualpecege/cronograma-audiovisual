import { defineConfig, devices } from '@playwright/test';
import { E2E_VAPID_PUBLIC_KEY, e2eEnv } from './tests/e2e/env.ts';

// Ponta a ponta contra `vite preview` e o Supabase local (TechSpec, Testing Approach): projeto celular
// (Pixel 7) e desktop (1440x900), mais o programa de Windows e Mac pelo `_electron` (projeto electron).
const env = e2eEnv();
const PREVIEW_URL = 'http://127.0.0.1:4173/cronograma-audiovisual/';

export default defineConfig({
  testDir: './tests/e2e',
  // Banco compartilhado: um teste por vez, semente nova antes da rodada.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list']],
  use: {
    baseURL: PREVIEW_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular', testIgnore: 'electron.spec.ts', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', testIgnore: 'electron.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'electron', testMatch: 'electron.spec.ts' },
  ],
  webServer: {
    command: 'npm run build -w @cronograma/web && npm run preview -w @cronograma/web -- --host 127.0.0.1 --port 4173 --strictPort',
    url: PREVIEW_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: env.apiUrl,
      VITE_SUPABASE_ANON_KEY: env.publishableKey,
      // Chave pública VAPID de teste: o navegador dos testes tem a inscrição simulada (E2E-022).
      VITE_VAPID_PUBLIC_KEY: E2E_VAPID_PUBLIC_KEY,
    },
  },
});
