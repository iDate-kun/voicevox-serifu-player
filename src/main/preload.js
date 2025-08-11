const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  generateAudio: (options) => ipcRenderer.invoke('generate-audio', options),
  onProgressUpdate: (callback) => ipcRenderer.on('progress-update', (_event, value) => callback(value)),
  // ここにレンダラーからメインへ通信する関数を定義していく
  // 例: sendMessage: (message) => ipcRenderer.send('message', message),

  // ここにメインからレンダラーへの通信を受け取る関数を定義していく
  // 例: onUpdateCounter: (callback) => ipcRenderer.on('update-counter', (_event, value) => callback(value))
});
