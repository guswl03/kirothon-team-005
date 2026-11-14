'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  analyze: (p) => ipcRenderer.invoke('analyze', p),
  retry: () => ipcRenderer.invoke('retry'),
  setTone: (t) => ipcRenderer.invoke('set-tone', t),
  regenerate: (p) => ipcRenderer.invoke('regenerate', p),
  followup: (q) => ipcRenderer.invoke('followup', q),
  setAuto: (on) => ipcRenderer.invoke('set-auto', on),
  setProvider: (id) => ipcRenderer.invoke('set-provider', id),
  checkKiro: () => ipcRenderer.invoke('check-kiro'),
  copy: (t) => ipcRenderer.invoke('copy', t),
  hide: () => ipcRenderer.invoke('hide'),
  openLink: (u) => ipcRenderer.invoke('open-link', u),
  onEvent: (cb) => on('svc-event', cb),
  onState: (cb) => on('app-state', cb),
  onIncoming: (cb) => on('incoming', cb),
});