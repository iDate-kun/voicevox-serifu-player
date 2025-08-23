const { contextBridge, ipcRenderer } = require('electron');

/**
 * レンダラープロセスに公開するIPCラッパー群。
 * - getCharacters: スピーカー一覧を取得
 * - generateAudio: 音声生成の実行と進捗受信
 * - onProgressUpdate: 進捗イベントの購読
 * - saveFavorites / loadFavorites: お気に入りの保存/読込
 * - checkPreviewFiles / generatePreviewFiles: プレビュー音声の確認/生成
 * - getPreviewAssetPath: プレビューディレクトリのパスを取得
 */
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
