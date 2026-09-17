'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbit', {
  getMeta: () => ipcRenderer.invoke('orbit:get-meta'),
  captureScreen: (opts) => ipcRenderer.invoke('orbit:capture-screen', opts || {}),
  getVisionSettings: () => ipcRenderer.invoke('orbit:get-vision-settings'),
  saveVisionSettings: (payload) => ipcRenderer.invoke('orbit:save-vision-settings', payload || {}),
  clearVisionKey: () => ipcRenderer.invoke('orbit:clear-vision-key'),
  visionPropose: (payload) => ipcRenderer.invoke('orbit:vision-propose', payload || {}),
});
