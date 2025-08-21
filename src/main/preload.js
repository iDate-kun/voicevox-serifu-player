const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  generateAudio: (options) => ipcRenderer.invoke('generate-audio', options),
  onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (_event, value) => callback(value)),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),
  loadFavorites: () => ipcRenderer.invoke('load-favorites'),
  checkPreviewFiles: () => ipcRenderer.invoke('check-preview-files'),
  generatePreviewFiles: () => ipcRenderer.invoke('generate-preview-files'),
  getPreviewAssetPath: () => ipcRenderer.invoke('get-preview-asset-path'),
});