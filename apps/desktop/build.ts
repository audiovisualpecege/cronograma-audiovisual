// Monta o programa de desktop em dist/: o processo principal e o preload (CommonJS, com a versão gravada) e o
// build do app web com base ./, servido pelo protocolo app:// (ADR-008).
// Uso: npm run build -w @cronograma/desktop
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { readAppVersion } from './src/version.ts';

const desktopDir = fileURLToPath(new URL('./', import.meta.url));
const distDir = fileURLToPath(new URL('./dist/', import.meta.url));

export async function buildDesktop(): Promise<void> {
  const version = readAppVersion();
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  await build({
    entryPoints: { main: 'src/main.ts', preload: 'src/preload.ts' },
    absWorkingDir: desktopDir,
    outdir: distDir,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    define: { __APP_VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
  // Pasta do app empacotado: o electron-builder lê daqui o nome e a versão, a mesma do package.json da raiz.
  const app = { name: 'cronograma-audiovisual', productName: 'Cronograma Audiovisual', version, main: 'main.cjs', description: 'Um produto Chiaro Filmes.', author: 'Chiaro Filmes', private: true };
  writeFileSync(`${distDir}package.json`, `${JSON.stringify(app, null, 2)}
`);
  // Ícone próprio do produto para a janela e as notificações (o do instalador vem de build/).
  for (const icon of ['icon.png', 'icon.ico']) copyFileSync(new URL(`./build/${icon}`, import.meta.url), `${distDir}${icon}`);

  // O mesmo app web do GitHub Pages, com caminhos relativos para abrir em app://cronograma/.
  execSync('npm run build -w @cronograma/web -- --outDir ../desktop/dist/web --emptyOutDir', {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: './' },
  });
  console.log(`Desktop v${version} montado em ${distDir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildDesktop();
}
