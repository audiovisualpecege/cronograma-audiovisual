import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Versão única do produto: o `version` do package.json da raiz do monorepo.
// O contêiner copia esse arquivo para o mesmo lugar relativo (tarefa 4).
export const ROOT_PACKAGE_JSON = fileURLToPath(new URL('../../../package.json', import.meta.url));

export function readAppVersion(packageJsonPath: string = ROOT_PACKAGE_JSON): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version === '') {
    throw new Error(`package.json sem versão: ${packageJsonPath}`);
  }
  return pkg.version;
}
