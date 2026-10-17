import { posix, win32 } from 'node:path';

// Caminhos da pasta central da rede, traduzidos entre o formato do PC (\\servidor\pasta) e o do Mac
// (/Volumes/pasta), como a equipe já faz nos outros programas de desktop (TechSpec, Integration Points).

/** Servidor usado ao voltar de /Volumes/pasta para \\servidor\pasta no Windows: o NAS da empresa. */
export const DEFAULT_SERVER = '172.16.52.30';

/** Pasta central dos instaladores; muda na tela Sobre do programa. */
export const DEFAULT_UPDATE_FOLDER = `\\\\${DEFAULT_SERVER}\\instaladores\\cronograma-audiovisual`;

interface ShareParts {
  server: string | null;
  share: string;
  rest: string[];
}

function parts(segments: string[]): string[] {
  return segments.filter((s) => s !== '');
}

/** Lê `\\servidor\pasta\...`, `smb://servidor/pasta/...` ou `/Volumes/pasta/...`; outro caminho devolve null. */
function parseShare(path: string): ShareParts | null {
  const unc = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(.*)$/.exec(path);
  if (unc && !path.startsWith('//Volumes')) {
    return { server: unc[1] ?? null, share: unc[2] ?? '', rest: parts((unc[3] ?? '').split(/[\\/]/)) };
  }
  const smb = /^smb:\/\/([^/]+)\/([^/]+)(.*)$/i.exec(path);
  if (smb) return { server: smb[1] ?? null, share: smb[2] ?? '', rest: parts((smb[3] ?? '').split('/')) };
  const volume = /^\/Volumes\/([^/]+)(.*)$/.exec(path);
  if (volume) return { server: null, share: volume[1] ?? '', rest: parts((volume[2] ?? '').split('/')) };
  return null;
}

/**
 * Converte o caminho da pasta da rede para o sistema em uso: no Mac, `\\nas\instaladores\x` vira
 * `/Volumes/instaladores/x`; no Windows, `/Volumes/instaladores/x` vira `\\<servidor>\instaladores\x`.
 * Caminhos locais e os que já estão no formato do sistema voltam como estão (sem a barra final).
 */
export function translatePath(path: string, platform: NodeJS.Platform = process.platform, server: string = DEFAULT_SERVER): string {
  const trimmed = path.trim();
  const share = parseShare(trimmed);
  if (!share) return trimmed;
  if (platform === 'win32') {
    return `\\\\${share.server ?? server}\\${[share.share, ...share.rest].join('\\')}`;
  }
  return `/Volumes/${[share.share, ...share.rest].join('/')}`;
}

/** Junta um nome de arquivo à pasta no formato do sistema; caminho já completo é só traduzido. */
export function joinPath(folder: string, file: string, platform: NodeJS.Platform = process.platform): string {
  const absolute = /^([\\/]|[a-z]:[\\/]|smb:\/\/)/i.test(file);
  if (absolute) return translatePath(file, platform);
  return platform === 'win32' ? win32.join(folder, file) : posix.join(folder, file);
}
