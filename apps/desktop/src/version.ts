import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Versão única do produto: o `version` do package.json da raiz do monorepo.
// No instalador, o electron-builder grava o mesmo número por `extraMetadata.version` (tarefa 9).
export const ROOT_PACKAGE_JSON = fileURLToPath(new URL('../../../package.json', import.meta.url));

export function readAppVersion(packageJsonPath: string = ROOT_PACKAGE_JSON): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version === '') {
    throw new Error(`package.json sem versão: ${packageJsonPath}`);
  }
  return pkg.version;
}
