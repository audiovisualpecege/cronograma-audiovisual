import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Ponte entre o app web e o programa de desktop: `window.cronogramaDesktop`, com a mesma forma de
// apps/web/src/desktop/bridge.ts. No navegador e no celular ela não existe.
contextBridge.exposeInMainWorld('cronogramaDesktop', {
  platform: process.platform,
  getUpdate: () => ipcRenderer.invoke('update:get'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getUpdateFolder: () => ipcRenderer.invoke('update:folder:get'),
  setUpdateFolder: (folder: string) => ipcRenderer.invoke('update:folder:set', folder),
  notify: (notification: { title: string; body?: string | null; link?: string | null }) => ipcRenderer.send('notify', notification),
  onNavigate: (callback: (path: string) => void) => {
    const listener = (_event: IpcRendererEvent, path: string) => callback(path);
    ipcRenderer.on('navigate', listener);
    return () => {
      ipcRenderer.removeListener('navigate', listener);
    };
  },
});
