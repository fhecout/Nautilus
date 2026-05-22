import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startNautilusServer } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_PORT = Number.parseInt(process.env.NAUTILUS_PORT || '3333', 10);

let apiServer;
let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Nautilus',
    width: 1360,
    height: 820,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#031013',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  if (!(await isApiOnline(API_PORT))) {
    apiServer = startNautilusServer(API_PORT);
  }
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  apiServer?.close();
});

ipcMain.handle('nautilus:window', (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;

  if (action === 'minimize') window.minimize();
  if (action === 'toggle-maximize') {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  }
  if (action === 'close') window.close();
});

async function isApiOnline(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/system`, {
      signal: AbortSignal.timeout(1200)
    });
    return response.ok;
  } catch {
    return false;
  }
}
