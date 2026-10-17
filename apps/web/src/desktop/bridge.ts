// Ponte com o programa de Windows e Mac (apps/desktop/src/preload.ts). No navegador e no celular ela não
// existe e as telas seguem como estão.

export interface DesktopUpdate {
  version: string;
  installer: string;
}

export interface DesktopBridge {
  platform: string;
  /** Versão nova lida pelo programa ao abrir na pasta central da rede, ou null. */
  getUpdate(): Promise<DesktopUpdate | null>;
  /** Abre o instalador da versão nova; falso se não conseguiu. */
  installUpdate(): Promise<boolean>;
  getUpdateFolder(): Promise<string>;
  setUpdateFolder(folder: string): Promise<{ folder: string; update: DesktopUpdate | null }>;
  notify(notification: { title: string; body?: string | null; link?: string | null }): void;
  onNavigate(callback: (path: string) => void): () => void;
}

declare global {
  interface Window {
    cronogramaDesktop?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.cronogramaDesktop;
}
