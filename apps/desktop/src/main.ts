import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, Menu, Notification, app, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { DEFAULT_UPDATE_FOLDER, translatePath } from './paths';
import { checkForUpdate, type UpdateInfo } from './update';

// Processo principal do programa de Windows e Mac (ADR-008): janela, protocolo app://, notificação do sistema,
// aviso de versão nova pela pasta da rede e abertura do instalador. Nenhuma regra de negócio aqui.

declare const __APP_VERSION__: string;

/** Versão do package.json da raiz, gravada no build (o instalador recebe a mesma por extraMetadata.version). */
const VERSION = __APP_VERSION__;
const SCHEME = 'app';
const HOST = 'cronograma';
const START_URL = `${SCHEME}://${HOST}/index.html`;
/** Fundo Noite (bloco [data-theme="noite"] de design-system/chiaro/tokens/colors.css): a janela nunca pisca clara. */
const NOITE = '#070010';
/** Igual ao appId do electron-builder.yml: identifica as notificações no Windows. */
const APP_ID = 'br.com.chiarofilmes.cronograma-audiovisual';

/** Build do app web (base ./) que vai junto no programa. */
const WEB_DIR = process.env.CRONOGRAMA_WEB_DIR ?? join(__dirname, 'web');
/** Ícone próprio do produto (nunca o da Chiaro), na janela e nas notificações. */
const ICON = join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

// Pasta de dados à parte (sessão, cópia local, configuração) só para os testes.
if (process.env.CRONOGRAMA_USER_DATA) app.setPath('userData', process.env.CRONOGRAMA_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// Configuração do aparelho: só a pasta central dos instaladores.
interface Config {
  updateFolder?: string;
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8')) as Config;
  } catch {
    return {};
  }
}

/** Pasta central: a variável CRONOGRAMA_UPDATE_DIR (testes e TI), a escolhida na tela Sobre ou a padrão. */
function updateFolder(): string {
  return translatePath(process.env.CRONOGRAMA_UPDATE_DIR ?? readConfig().updateFolder ?? DEFAULT_UPDATE_FOLDER);
}

let updateCheck: Promise<UpdateInfo | null> = Promise.resolve(null);

function startUpdateCheck(): void {
  updateCheck = checkForUpdate({ folder: updateFolder(), currentVersion: VERSION });
}

let mainWindow: BrowserWindow | null = null;

/** Rota do app (hash) a partir do link de um aviso; só rotas internas. */
function routeOf(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  const hash = link.slice(link.indexOf('#') + 1);
  return hash.startsWith('/') && !hash.startsWith('//') ? hash : null;
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function serveWeb(): void {
  const root = resolve(WEB_DIR);
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    } catch {
      return new Response('Endereço inválido', { status: 400 });
    }
    const file = resolve(root, `.${path}`);
    const inside = relative(root, file);
    if (url.host !== HOST || inside.startsWith('..') || isAbsolute(inside)) {
      return new Response('Não encontrado', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function isAppUrl(url: string): boolean {
  return url.startsWith(`${SCHEME}://${HOST}/`);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: NOITE,
    title: 'Cronograma Audiovisual',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
  });
  // Links de fora (mapa do local, Google Agenda) abrem no navegador; a janela só mostra o app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  void win.loadURL(START_URL);
}

function registerIpc(): void {
  ipcMain.handle('update:get', () => updateCheck);
  ipcMain.handle('update:install', async () => {
    const update = await updateCheck;
    if (!update) return false;
    // Abre o instalador do sistema (NSIS no Windows, .dmg no Mac) e fecha o programa para ele poder substituí-lo.
    const error = await shell.openPath(update.installer);
    if (error) return false;
    setTimeout(() => app.quit(), 500);
    return true;
  });
  ipcMain.handle('update:folder:get', () => updateFolder());
  ipcMain.handle('update:folder:set', async (_event, folder: unknown) => {
    if (typeof folder !== 'string') return { folder: updateFolder(), update: await updateCheck };
    const config = readConfig();
    const value = folder.trim();
    if (value) config.updateFolder = value;
    else delete config.updateFolder;
    writeFileSync(configPath(), JSON.stringify(config, null, 2));
    startUpdateCheck();
    return { folder: updateFolder(), update: await updateCheck };
  });
  ipcMain.on('notify', (_event, payload: unknown) => {
    if (!Notification.isSupported() || !payload || typeof payload !== 'object') return;
    const { title, body, link } = payload as Record<string, unknown>;
    if (typeof title !== 'string') return;
    const notification = new Notification({ title, body: typeof body === 'string' ? body : '', icon: ICON });
    notification.on('click', () => {
      showWindow();
      const route = routeOf(link);
      if (route) mainWindow?.webContents.send('navigate', route);
    });
    notification.show();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  // Tema escuro nativo: menus, diálogos e barras do sistema no escuro, sem seguir o tema do sistema (ADR-005).
  nativeTheme.themeSource = 'dark';
  app.setAppUserModelId(APP_ID);
  app.setAboutPanelOptions({ applicationName: 'Cronograma Audiovisual', applicationVersion: VERSION, copyright: 'Um produto Chiaro Filmes' });

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(
      process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null,
    );
    serveWeb();
    registerIpc();
    startUpdateCheck();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
