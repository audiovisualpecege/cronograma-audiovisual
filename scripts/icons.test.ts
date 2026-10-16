import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultPaths, generateIcons } from './icons';

let outDir: string;
let webDir: string;
let desktopDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'cronograma-icons-'));
  webDir = join(outDir, 'web');
  desktopDir = join(outDir, 'desktop');
  await generateIcons({ ...defaultPaths, webDir, desktopDir });
}, 60_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

// Tamanhos guardados no diretório de um .ico (0 no byte de largura quer dizer 256).
async function icoSizes(file: string): Promise<number[]> {
  const data = await readFile(file);
  expect(data.readUInt16LE(2)).toBe(1);
  const count = data.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => data.readUInt8(6 + i * 16) || 256).sort((a, b) => a - b);
}

async function pngSize(file: string) {
  const meta = await sharp(file).metadata();
  return { format: meta.format, width: meta.width, height: meta.height };
}

async function cornerAlpha(file: string) {
  const data = await sharp(file).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  return data[3];
}

describe('scripts/icons.ts', () => {
  it('UT-175 gera do icon.svg os PNG 16, 32, 180, 192, 512, o 512 maskable, o favicon.ico e o .ico com 16, 32, 48 e 256', async () => {
    const pngs: [string, number][] = [
      ['icon-16.png', 16],
      ['icon-32.png', 32],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
      ['icon-512-maskable.png', 512],
    ];
    for (const [name, size] of pngs) {
      expect(await pngSize(join(webDir, name)), name).toEqual({ format: 'png', width: size, height: size });
    }
    expect(await icoSizes(join(webDir, 'favicon.ico'))).toEqual([16, 32]);
    expect(await icoSizes(join(desktopDir, 'icon.ico'))).toEqual([16, 32, 48, 256]);
    expect(await pngSize(join(desktopDir, 'icon.png'))).toEqual({ format: 'png', width: 1024, height: 1024 });
  });

  it('o maskable leva o gradiente até a borda e o ícone comum tem cantos arredondados', async () => {
    expect(await cornerAlpha(join(webDir, 'icon-512-maskable.png'))).toBe(255);
    expect(await cornerAlpha(join(webDir, 'icon-512.png'))).toBe(0);
  });
});
