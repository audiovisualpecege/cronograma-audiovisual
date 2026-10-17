import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkForUpdate, compareVersions } from './update';

const LATEST = (version: string) =>
  JSON.stringify({ version, windows: `cronograma-audiovisual-${version}-windows.exe`, mac: `cronograma-audiovisual-${version}-mac.dmg` });

describe('checkForUpdate', () => {
  let folder: string;
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'cronograma-update-'));
  });
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  // UT-121
  it('avisa só quando a versão da pasta é maior e fica quieto com a pasta inacessível', async () => {
    // Pasta temporária de verdade: no Linux da CI, o formato de caminho é o do Mac.
    const platform = process.platform === 'win32' ? 'win32' : 'darwin';
    await writeFile(join(folder, 'latest.json'), LATEST('1.1.0'));
    const update = await checkForUpdate({ folder, currentVersion: '1.0.0', platform });
    const installer = join(folder, platform === 'darwin' ? 'cronograma-audiovisual-1.1.0-mac.dmg' : 'cronograma-audiovisual-1.1.0-windows.exe');
    expect(update).toEqual({ version: '1.1.0', installer });

    await writeFile(join(folder, 'latest.json'), LATEST('1.0.0'));
    expect(await checkForUpdate({ folder, currentVersion: '1.0.0', platform })).toBeNull();

    await writeFile(join(folder, 'latest.json'), LATEST('0.9.0'));
    expect(await checkForUpdate({ folder, currentVersion: '1.0.0', platform })).toBeNull();

    await expect(checkForUpdate({ folder: join(folder, 'nao-existe'), currentVersion: '1.0.0', platform })).resolves.toBeNull();
  });

  it('usa o instalador do Mac no Mac, já no caminho /Volumes', async () => {
    const files: Record<string, string> = { '/Volumes/instaladores/cronograma/latest.json': LATEST('1.1.0') };
    const read = async (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT ${path}`);
      return content;
    };
    const update = await checkForUpdate({ folder: '\\\\nas\\instaladores\\cronograma', currentVersion: '1.0.0', platform: 'darwin', read });
    expect(update).toEqual({ version: '1.1.0', installer: '/Volumes/instaladores/cronograma/cronograma-audiovisual-1.1.0-mac.dmg' });
  });

  it('pasta que não responde a tempo e arquivo inválido não mostram aviso', async () => {
    const never = () => new Promise<string>(() => undefined);
    expect(await checkForUpdate({ folder, currentVersion: '1.0.0', platform: 'win32', read: never, timeoutMs: 20 })).toBeNull();
    expect(await checkForUpdate({ folder, currentVersion: '1.0.0', platform: 'win32', read: async () => '{ quebrado' })).toBeNull();
    expect(await checkForUpdate({ folder, currentVersion: '1.0.0', platform: 'win32', read: async () => '{"version":"2.0"}' })).toBeNull();
    expect(await checkForUpdate({ folder, currentVersion: '1.0.0', platform: 'linux', read: async () => LATEST('1.1.0') })).toBeNull();
  });
});

describe('compareVersions', () => {
  it('compara número a número, não como texto', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v0.9.9', '1.0.0')).toBeLessThan(0);
  });
});
