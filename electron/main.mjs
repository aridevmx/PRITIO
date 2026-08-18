import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  protocol,
  shell,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import updaterModule from "electron-updater";

const { autoUpdater } = updaterModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

const APP_SCHEME = "app";
const PROTOCOL_SCHEME = "pritio";
const AUTH_PREFIX = "auth";
const PROTOCOL_PREFIX = `${PROTOCOL_SCHEME}://`;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

let mainWindow = null;
let pendingDeepLink = null;

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function openExternalSafe(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      shell.openExternal(parsed.toString());
    }
  } catch {
    // URL malformada: ignorar.
  }
}

function isAuthCallback(url) {
  return url.startsWith(`${PROTOCOL_PREFIX}${AUTH_PREFIX}`);
}

function flushDeepLink() {
  if (!pendingDeepLink) return;
  const url = pendingDeepLink;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (isAuthCallback(url)) {
      mainWindow.webContents.send("desktop:auth-callback", url);
    }
    pendingDeepLink = null;
  }
}

function handleDeepLink(url) {
  pendingDeepLink = url;
  flushDeepLink();
}

function registerProtocolClient() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  }
}

async function serveApp(request) {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const target = path.normalize(path.join(DIST_DIR, pathname));
  const inDist =
    target === DIST_DIR || target.startsWith(DIST_DIR + path.sep);
  const file =
    inDist && fs.existsSync(target) && fs.statSync(target).isFile()
      ? target
      : path.join(DIST_DIR, "index.html");

  try {
    const body = await fs.promises.readFile(file);
    const ext = path.extname(file).toLowerCase();
    return new Response(body, {
      headers: {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

let updateStatus = { status: "idle" };

function sendUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:update-status", updateStatus);
  }
}

function setUpdateStatus(payload) {
  updateStatus = { ...updateStatus, ...payload };
  sendUpdateStatus();
  console.log("[Pritio-desktop] update status:", JSON.stringify(updateStatus));
}

function handleUpdateError(error) {
  const message = error?.message ?? String(error);
  if (/no published versions/i.test(message)) {
    setUpdateStatus({ status: "not-available" });
    return;
  }
  setUpdateStatus({ status: "error", message });
}

function initAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () =>
    setUpdateStatus({ status: "checking" }),
  );
  autoUpdater.on("update-available", (info) =>
    setUpdateStatus({ status: "available", version: info.version }),
  );
  autoUpdater.on("update-not-available", () =>
    setUpdateStatus({ status: "not-available" }),
  );
  autoUpdater.on("download-progress", (progress) =>
    setUpdateStatus({
      status: "downloading",
      percent: Math.round(progress.percent),
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    setUpdateStatus({ status: "downloaded", version: info.version }),
  );
  autoUpdater.on("error", handleUpdateError);
}

function createMainWindow() {
  const icon = path.join(__dirname, "..", "build", "icon.png");
  const windowOptions = {
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: "#F4F7F8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
  if (fs.existsSync(icon)) windowOptions.icon = icon;

  mainWindow = new BrowserWindow(windowOptions);

  let shown = false;
  const showWindow = () => {
    if (shown || mainWindow.isDestroyed()) return;
    shown = true;
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.once("ready-to-show", showWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Red de seguridad: si la ventana nunca pinta, mostrarla igualmente para
  // evitar un arranque invisible (síntoma "no pasó nada").
  setTimeout(showWindow, 2500);

  mainWindow.webContents.on("did-finish-load", () => {
    showWindow();
    flushDeepLink();
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[Pritio-desktop] renderer load failed (${errorCode} ${errorDescription}): ${validatedURL}`,
      );
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `[Pritio-desktop] renderer process gone (${details.reason}, exitCode ${details.exitCode})`,
    );
  });

  if (app.isPackaged) {
    mainWindow.loadURL(`${APP_SCHEME}://bundle/`);
  } else {
    mainWindow.loadURL(DEV_SERVER_URL);
  }

  return mainWindow;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  registerProtocolClient();

  const startupLink = process.argv.find((arg) =>
    arg.startsWith(PROTOCOL_PREFIX),
  );
  if (startupLink) pendingDeepLink = startupLink;

  app.on("second-instance", (_event, commandLine) => {
    const link = commandLine.find((arg) => arg.startsWith(PROTOCOL_PREFIX));
    if (link) handleDeepLink(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafe(url);
      return { action: "deny" };
    });
    contents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === "notifications");
    });
  });

  ipcMain.handle("desktop:app-version", () => app.getVersion());
  ipcMain.handle("desktop:open-external", (_event, url) =>
    openExternalSafe(url),
  );
  ipcMain.handle("desktop:notify", (_event, title, body) => {
    if (!Notification.isSupported()) return false;
    new Notification({
      title: String(title ?? ""),
      body: String(body ?? ""),
    }).show();
    return true;
  });
  ipcMain.handle("desktop:is-main-window-focused", () =>
    mainWindow ? mainWindow.isFocused() : false,
  );
  ipcMain.handle("desktop:get-update-status", () => updateStatus);
  ipcMain.handle("desktop:check-for-updates", () => {
    if (!app.isPackaged) {
      setUpdateStatus({ status: "disabled" });
      return updateStatus;
    }
    autoUpdater.checkForUpdates().catch(handleUpdateError);
    return updateStatus;
  });
  ipcMain.handle("desktop:install-update", () => {
    if (app.isPackaged && updateStatus.status === "downloaded") {
      autoUpdater.quitAndInstall();
    }
  });
  ipcMain.handle("desktop:get-agent-enabled", () =>
    Boolean(getSettings().agentEnabled),
  );
  ipcMain.handle("desktop:set-agent-enabled", (_event, enabled) => {
    const settings = getSettings();
    settings.agentEnabled = Boolean(enabled);
    saveSettings(settings);
    return Boolean(enabled);
  });
  ipcMain.on("desktop:preload-ready", () => {
    console.log("[Pritio-desktop] preload cargado, bridge expuesto");
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("app.pritio.desktop");
    protocol.handle(APP_SCHEME, serveApp);

    initAutoUpdater();
    createMainWindow();

    if (app.isPackaged && process.env.PRITIO_DISABLE_AUTOUPDATE !== "1") {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {
          // Error silencioso: el check automático no debe molestar al arranque.
        });
      }, 5000);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
