// Gera os instaladores sem assinatura (NSIS no Windows, .dmg no Mac) em release/ e o latest.json ao lado deles,
// pronto para copiar para a pasta central da rede.
// Uso: npm run dist -w @cronograma/desktop [-- --win | --mac]
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { buildDesktop } from './build.ts';
import { readAppVersion } from './src/version.ts';
import type { LatestJson } from './src/update.ts';

const desktopDir = fileURLToPath(new URL('./', import.meta.url));

/** Nomes dos instaladores; os mesmos do artifactName do electron-builder.yml. */
function latestJson(version: string): LatestJson {
  return {
    version,
    windows: `cronograma-audiovisual-${version}-windows.exe`,
    mac: `cronograma-audiovisual-${version}-mac.dmg`,
  };
}

// O instalador leva a URL e a chave pública do Supabase de produção (variáveis VITE_ ou apps/web/.env); sem elas o
// programa abriria numa tela vazia.
const webEnv = { ...loadEnv('production', fileURLToPath(new URL('../web/', import.meta.url)), 'VITE_'), ...process.env };
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((name) => !webEnv[name]);
if (missing.length > 0) {
  console.error(`Defina ${missing.join(' e ')} (em apps/web/.env ou no ambiente) antes de gerar os instaladores.`);
  process.exit(1);
}

const version = readAppVersion();
// Com o app em dist/, o electron-builder não acha o Electron instalado: passa a versão dele.
const require = createRequire(import.meta.url);
const electronVersion = (require('electron/package.json') as { version: string }).version;
await buildDesktop();

const targets = process.argv.slice(2).filter((arg) => arg === '--win' || arg === '--mac');
const result = spawnSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), '--config', 'electron-builder.yml', `-c.extraMetadata.version=${version}`, `-c.electronVersion=${electronVersion}`, '--publish', 'never', ...targets],
  { cwd: desktopDir, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);

writeFileSync(new URL('./release/latest.json', import.meta.url), `${JSON.stringify(latestJson(version), null, 2)}\n`);
console.log(`Instaladores e latest.json da v${version} em ${desktopDir}release`);
