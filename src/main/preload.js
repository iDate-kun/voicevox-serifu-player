const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  generateAudio: (options) => ipcRenderer.invoke('generate-audio', options),
  onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (_event, value) => callback(value)),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),
  loadFavorites: () => ipcRenderer.invoke('load-favorites'),
});