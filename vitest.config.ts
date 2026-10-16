import { defineConfig } from 'vitest/config';

// Projetos de teste do monorepo. `npm test` roda os de unidade (unit:*);
// `npm run test:integration` roda os *.int.test.ts, que exigem o Supabase local.
const unitExclude = ['**/node_modules/**', '**/dist/**', '**/*.int.test.*'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit:core',
          root: './packages/core',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: unitExclude,
        },
      },
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'unit:web',
          root: './apps/web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
          exclude: unitExclude,
          setupFiles: ['./test/setup.ts'],
        },
      },
      {
        test: {
          name: 'unit:worker',
          root: './apps/worker',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: unitExclude,
        },
      },
      {
        test: {
          name: 'unit:desktop',
          root: './apps/desktop',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: unitExclude,
        },
      },
      {
        test: {
          name: 'unit:scripts',
          root: './scripts',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: unitExclude,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/**/*.int.test.ts', 'apps/**/*.int.test.ts', 'supabase/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          environment: 'node',
        },
      },
    ],
  },
});
