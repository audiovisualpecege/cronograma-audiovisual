/// <reference lib="dom" />
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { buildDesktop } from '../../apps/desktop/build.ts';
import { readAppVersion } from '../../apps/desktop/src/version.ts';
import { E2E_VAPID_PUBLIC_KEY, e2eEnv } from './env.ts';

// Programa de Windows e Mac (TechSpec, Testing Approach): abertura, versão e aviso de versão nova com uma pasta
// temporária no lugar da pasta central da rede.
// Sem a barra final: no Windows, uma barra antes da aspa escaparia a aspa na linha de comando do Electron.
const desktopDir = fileURLToPath(new URL('../../apps/desktop', import.meta.url));
const version = readAppVersion();
const [major, minor] = version.split('.').map(Number);
const newer = `${major}.${(minor ?? 0) + 1}.0`;

let folder: string;
let app: ElectronApplication | null = null;

async function launch(): Promise<ElectronApplication> {
  app = await electron.launch({
    args: [desktopDir],
    env: { ...process.env, CRONOGRAMA_UPDATE_DIR: folder, CRONOGRAMA_USER_DATA: join(folder, 'dados') },
  });
  return app;
}

function latest(v: string): string {
  return JSON.stringify({ version: v, windows: `cronograma-audiovisual-${v}-windows.exe`, mac: `cronograma-audiovisual-${v}-mac.dmg` });
}

test.describe('programa de desktop', () => {
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    const env = e2eEnv();
    process.env.VITE_SUPABASE_URL = env.apiUrl;
    process.env.VITE_SUPABASE_ANON_KEY = env.publishableKey;
    process.env.VITE_VAPID_PUBLIC_KEY = E2E_VAPID_PUBLIC_KEY;
    await buildDesktop();
  });

  test.beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'cronograma-pasta-central-'));
  });

  test.afterEach(async () => {
    await app?.close();
    app = null;
    await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  test('E2E-026 abre com o login e a versão; com latest.json mais novo aparece "Instalar"', async () => {
    await writeFile(join(folder, 'latest.json'), latest(version));
    let window = await (await launch()).firstWindow();
    await expect(window).toHaveURL(/^app:\/\/cronograma\/index\.html#\/entrar/);
    await expect(window.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(window.locator('.auth-footer')).toContainText(`v${version}`);
    await expect(window.locator('html')).toHaveAttribute('data-theme', 'noite');
    await expect(window.getByRole('button', { name: /^Instalar v/ })).toHaveCount(0);
    await app!.close();

    await writeFile(join(folder, 'latest.json'), latest(newer));
    window = await (await launch()).firstWindow();
    await expect(window.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(window.getByRole('button', { name: `Instalar v${newer}` })).toBeVisible();
    const background = await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBackgroundColor());
    expect(background?.toUpperCase()).toBe('#070010');
  });
});
