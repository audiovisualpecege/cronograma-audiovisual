import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readAppVersion as desktopVersion } from '../apps/desktop/src/version';
import viteConfig, { appVersion as webVersion } from '../apps/web/vite.config';
import { readAppVersion as workerVersion } from '../apps/worker/src/version';

function readPackage(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;
}

const rootVersion = readPackage('../package.json').version;

describe('versão única', () => {
  it('UT-177 o build lê a versão do package.json da raiz; apps/desktop e o worker relatam o mesmo número', () => {
    expect(rootVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(webVersion).toBe(rootVersion);
    expect(viteConfig.define?.__APP_VERSION__).toBe(JSON.stringify(rootVersion));
    expect(workerVersion()).toBe(rootVersion);
    expect(desktopVersion()).toBe(rootVersion);
  });

  it('os pacotes do monorepo não guardam uma segunda versão', () => {
    for (const dir of ['packages/core', 'apps/web', 'apps/worker', 'apps/desktop']) {
      expect(readPackage(`../${dir}/package.json`).version, dir).toBeUndefined();
    }
  });
});
