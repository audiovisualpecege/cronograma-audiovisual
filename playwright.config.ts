import { defineConfig } from '@playwright/test';

// Ponta a ponta. Os projetos (Pixel 7, desktop 1440x900, Electron) e o servidor entram nas tarefas 5 a 9.
export default defineConfig({
  testDir: './e2e',
});
