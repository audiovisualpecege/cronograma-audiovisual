import { readFile } from 'node:fs/promises';
import { joinPath, translatePath } from './paths';

// Aviso de versão nova pela pasta central da rede (TechSpec, Versão): o programa lê o `latest.json` que fica ao
// lado dos instaladores e, se a versão de lá for maior, oferece abrir o instalador. Sem atualização silenciosa.

/** Conteúdo do `latest.json`: a versão e o nome do instalador de cada sistema, na mesma pasta. */
export interface LatestJson {
  version: string;
  windows: string;
  mac: string;
}

export interface UpdateInfo {
  version: string;
  /** Caminho completo do instalador, no formato do sistema em uso. */
  installer: string;
}

export interface CheckOptions {
  /** Pasta central, em qualquer formato (`\\servidor\pasta` ou `/Volumes/pasta`). */
  folder: string;
  currentVersion: string;
  platform?: NodeJS.Platform;
  /** Tempo máximo de leitura: pasta da rede fora do alcance pode demorar a responder. */
  timeoutMs?: number;
  read?: (path: string) => Promise<string>;
}

export const LATEST_FILE = 'latest.json';
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** Compara MAJOR.MINOR.PATCH: negativo se `a` é menor, zero se igual, positivo se maior. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a.trim());
  const pb = SEMVER.exec(b.trim());
  if (!pa || !pb) throw new Error(`Versão fora do formato MAJOR.MINOR.PATCH: ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isLatestJson(value: unknown): value is LatestJson {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === 'string' && SEMVER.test(v.version) && typeof v.windows === 'string' && typeof v.mac === 'string';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tempo esgotado')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Versão nova na pasta central, ou null quando não há o que avisar: versão igual ou menor, pasta inacessível,
 * arquivo inválido ou sistema sem instalador. Nunca lança erro (US-027 EC-1 e EC-2).
 */
export async function checkForUpdate({
  folder,
  currentVersion,
  platform = process.platform,
  timeoutMs = 10_000,
  read = (path) => readFile(path, 'utf8'),
}: CheckOptions): Promise<UpdateInfo | null> {
  try {
    const dir = translatePath(folder, platform);
    const latest: unknown = JSON.parse(await withTimeout(read(joinPath(dir, LATEST_FILE, platform)), timeoutMs));
    if (!isLatestJson(latest) || compareVersions(latest.version, currentVersion) <= 0) return null;
    const file = platform === 'win32' ? latest.windows : platform === 'darwin' ? latest.mac : '';
    if (!file) return null;
    return { version: latest.version.replace(/^v/, ''), installer: joinPath(dir, file, platform) };
  } catch {
    return null;
  }
}
