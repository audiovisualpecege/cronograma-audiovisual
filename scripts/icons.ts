// Gera todos os tamanhos do ícone do produto a partir de apps/web/src/assets/icon.svg.
// 16 e 32 px saem da variante icon-small.svg, desenhada para ficar legível nesses tamanhos.
// Uso: npm run icons
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const rootDir = fileURLToPath(new URL('../', import.meta.url));

export interface IconPaths {
  svg: string;
  smallSvg: string;
  webDir: string;
  desktopDir: string;
}

export const defaultPaths: IconPaths = {
  svg: join(rootDir, 'apps/web/src/assets/icon.svg'),
  smallSvg: join(rootDir, 'apps/web/src/assets/icon-small.svg'),
  webDir: join(rootDir, 'apps/web/public'),
  desktopDir: join(rootDir, 'apps/desktop/build'),
};

const SMALL_MAX = 32;
// Área segura do ícone maskable: o símbolo ocupa 80% e o gradiente vai até a borda.
const MASKABLE_SCALE = 0.8;

function render(svg: Buffer, size: number): Promise<Buffer> {
  // O SVG tem 512 px de base: renderiza no mínimo nessa resolução e reduz, para bordas suaves.
  return sharp(svg, { density: 72 * Math.max(1, size / 512) })
    .resize(size, size)
    .png()
    .toBuffer();
}

// Monta o SVG maskable com o fundo sem cantos e o símbolo reduzido à área segura.
export function maskableSvg(svg: string): string {
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0];
  const glyph = svg.match(/<g id="glyph">[\s\S]*?<\/g>/)?.[0];
  if (!defs || !glyph) throw new Error('icon.svg precisa de <defs> e <g id="glyph">');
  const offset = (512 * (1 - MASKABLE_SCALE)) / 2;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
    defs,
    '<rect width="512" height="512" fill="url(#chiaro-gradient)"/>',
    `<g transform="translate(${offset} ${offset}) scale(${MASKABLE_SCALE})">${glyph}</g>`,
    '</svg>',
  ].join('');
}

export async function generateIcons(paths: IconPaths = defaultPaths): Promise<string[]> {
  const svg = await readFile(paths.svg);
  const smallSvg = await readFile(paths.smallSvg);
  const png = (size: number) => render(size <= SMALL_MAX ? smallSvg : svg, size);

  await mkdir(paths.webDir, { recursive: true });
  await mkdir(paths.desktopDir, { recursive: true });

  const [p16, p32, p48, p180, p192, p256, p512, p1024] = await Promise.all(
    [16, 32, 48, 180, 192, 256, 512, 1024].map(png),
  );
  const maskable = await render(Buffer.from(maskableSvg(svg.toString('utf8'))), 512);

  const files: [string, Buffer][] = [
    [join(paths.webDir, 'favicon.ico'), await pngToIco([p16!, p32!])],
    [join(paths.webDir, 'icon-16.png'), p16!],
    [join(paths.webDir, 'icon-32.png'), p32!],
    [join(paths.webDir, 'apple-touch-icon.png'), p180!],
    [join(paths.webDir, 'icon-192.png'), p192!],
    [join(paths.webDir, 'icon-512.png'), p512!],
    [join(paths.webDir, 'icon-512-maskable.png'), maskable],
    // Windows (.ico) e Mac (o electron-builder faz o .icns a partir do PNG 1024).
    [join(paths.desktopDir, 'icon.ico'), await pngToIco([p16!, p32!, p48!, p256!])],
    [join(paths.desktopDir, 'icon.png'), p1024!],
  ];
  await Promise.all(files.map(([file, data]) => writeFile(file, data)));
  return files.map(([file]) => file);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = await generateIcons();
  for (const file of files) console.log(file);
}
