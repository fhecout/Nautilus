import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nautilusWindow', {
  minimize: () => ipcRenderer.invoke('nautilus:window', 'minimize'),
  toggleMaximize: () => ipcRenderer.invoke('nautilus:window', 'toggle-maximize'),
  close: () => ipcRenderer.invoke('nautilus:window', 'close')
});

