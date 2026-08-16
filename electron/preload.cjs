const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = {
  appVersion: "desktop:app-version",
  openExternal: "desktop:open-external",
  notify: "desktop:notify",
  isFocused: "desktop:is-main-window-focused",
  getAgent: "desktop:get-agent-enabled",
  setAgent: "desktop:set-agent-enabled",
  newTask: "desktop:new-task",
  authCallback: "desktop:auth-callback",
  getUpdateStatus: "desktop:get-update-status",
  checkUpdates: "desktop:check-for-updates",
  installUpdate: "desktop:install-update",
  updateStatus: "desktop:update-status",
};

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// El listener del callback de auth se registra al cargar el preload (antes de
// los scripts de la página) para no perder deep links que llegan durante el
// arranque en frío; `onAuthCallback` entrega el último recibido y sigue en vivo.
let lastAuthCallback = null;
const authListeners = new Set();

ipcRenderer.on(CHANNELS.authCallback, (_event, payload) => {
  lastAuthCallback = payload;
  for (const listener of authListeners) listener(payload);
});

function subscribeAuthCallback(callback) {
  authListeners.add(callback);
  return () => authListeners.delete(callback);
}

contextBridge.exposeInMainWorld("__PRIO_DESKTOP__", {
  platform: process.platform,
  appVersion: () => ipcRenderer.invoke(CHANNELS.appVersion),
  shellOpenExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url),
  notify: (title, body) => ipcRenderer.invoke(CHANNELS.notify, title, body),
  isMainWindowFocused: () => ipcRenderer.invoke(CHANNELS.isFocused),
  getAgentEnabled: () => ipcRenderer.invoke(CHANNELS.getAgent),
  setAgentEnabled: (enabled) => ipcRenderer.invoke(CHANNELS.setAgent, enabled),
  onNewTask: (callback) => subscribe(CHANNELS.newTask, callback),
  onAuthCallback: (callback) => {
    if (lastAuthCallback != null) {
      const url = lastAuthCallback;
      lastAuthCallback = null;
      callback(url);
    }
    return subscribeAuthCallback(callback);
  },
  getUpdateStatus: () => ipcRenderer.invoke(CHANNELS.getUpdateStatus),
  checkForUpdates: () => ipcRenderer.invoke(CHANNELS.checkUpdates),
  installUpdate: () => ipcRenderer.invoke(CHANNELS.installUpdate),
  onUpdateStatus: (callback) => subscribe(CHANNELS.updateStatus, callback),
});

ipcRenderer.send("desktop:preload-ready");
