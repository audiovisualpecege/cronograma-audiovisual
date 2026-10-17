import { defineConfig, devices } from '@playwright/test';
import { e2eEnv } from './tests/e2e/env.ts';

// Ponta a ponta contra `vite preview` e o Supabase local (TechSpec, Testing Approach): projeto celular
// (Pixel 7) e desktop (1440x900). O Electron entra na tarefa 9.
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
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'npm run build -w @cronograma/web && npm run preview -w @cronograma/web -- --host 127.0.0.1 --port 4173 --strictPort',
    url: PREVIEW_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: env.apiUrl,
      VITE_SUPABASE_ANON_KEY: env.publishableKey,
    },
  },
});
