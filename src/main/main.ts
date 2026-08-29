/**
 * Purpose: Electron main process script that handles window management, native menus, and IPC handlers for file operations and system dialogs.
 */
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import { appendFileSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkForUpdates, downloadUpdate } from "./autoUpdater.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startupLogPath = path.join(app.getPath("logs"), "startup.log");

function formatError(error: unknown) {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

function logStartup(message: string, error?: unknown) {
  const line = `[${new Date().toISOString()}] ${message}${error ? `\n${formatError(error)}` : ""}\n`;

  try {
    mkdirSync(path.dirname(startupLogPath), { recursive: true });
    appendFileSync(startupLogPath, line);
  } catch {
    // Logging must never prevent the application from starting.
  }

  console.error(line.trim());
}

process.on("uncaughtException", (error) => {
  logStartup("Uncaught exception during application startup.", error);
  if (app.isReady()) {
    dialog.showErrorBox("OpenCreate Forge could not start", formatError(error));
  }
});

process.on("unhandledRejection", (reason) => {
  logStartup("Unhandled promise rejection during application startup.", reason);
});

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
const APP_ROOT = path.join(__dirname, "..");
process.env.APP_ROOT = APP_ROOT;

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - https://github.com/vitejs/vite/discussions/5912
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, "public") : RENDERER_DIST;

let win: BrowserWindow | null;
let splash: BrowserWindow | null;
let safeQuitInProgress = false;
let safeQuitRequestInFlight = false;
const RENDERER_RECOVERY_STABILIZATION_MS = 5_000;
let rendererRecoveryAttempts = 0;
let rendererRecoveryResetTimer: NodeJS.Timeout | null = null;
let rendererRecoveryDialogOpen = false;
let rendererRecoveryReloading = false;
let rendererRecoveryCrashExpected = false;
let pendingRendererRecovery: {
  source: "render-process-gone" | "unresponsive";
  reason?: string;
  exitCode?: number;
} | null = null;
let menuState = {
  hasProject: false,
  showRulers: true,
  showGuides: true,
  snapToGuides: true,
  snapToLayers: true,
  updateStatus: "",
};

function clearRendererRecoveryResetTimer() {
  if (rendererRecoveryResetTimer) {
    clearTimeout(rendererRecoveryResetTimer);
    rendererRecoveryResetTimer = null;
  }
}

function markRendererStable() {
  rendererRecoveryReloading = false;
  clearRendererRecoveryResetTimer();
  rendererRecoveryResetTimer = setTimeout(() => {
    rendererRecoveryAttempts = 0;
    rendererRecoveryResetTimer = null;
  }, RENDERER_RECOVERY_STABILIZATION_MS);
}

function describeRendererFailure(
  source: "render-process-gone" | "unresponsive",
  details?: { reason?: string; exitCode?: number },
) {
  return `${source} (reason: ${details?.reason || "unknown"}, exit code: ${details?.exitCode ?? "unknown"})`;
}

function showRendererRecoveryDialog(window: BrowserWindow, failureDescription: string) {
  if (rendererRecoveryDialogOpen || window.isDestroyed()) return;

  rendererRecoveryDialogOpen = true;
  void dialog
    .showMessageBox(window, {
      type: "error",
      title: "OpenCreate Forge parou de responder",
      message: "O renderer do aplicativo falhou novamente.",
      detail: `${failureDescription}\n\nA sessão foi salva no último snapshot disponível. Você pode tentar recarregar o app ou sair.`,
      buttons: ["Recarregar app", "Sair"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      rendererRecoveryDialogOpen = false;
      if (response !== 0 || window.isDestroyed()) return;

      rendererRecoveryAttempts = 1;
      pendingRendererRecovery = {
        source: "render-process-gone",
        reason: "manual-recovery",
      };
      rendererRecoveryReloading = true;
      window.webContents.reloadIgnoringCache();
    })
    .catch((error) => {
      rendererRecoveryDialogOpen = false;
      logStartup("Failed to show renderer recovery dialog.", error);
    });
}

function recoverRenderer(
  window: BrowserWindow,
  source: "render-process-gone" | "unresponsive",
  details?: { reason?: string; exitCode?: number },
) {
  const failureDescription = describeRendererFailure(source, details);
  logStartup(`Renderer recovery requested: ${failureDescription}.`);

  if (safeQuitInProgress || window.isDestroyed()) return;

  if (rendererRecoveryReloading) {
    rendererRecoveryReloading = false;
    logStartup("Renderer exited while a recovery reload was already in progress.");
    return;
  }

  if (rendererRecoveryAttempts >= 1) {
    showRendererRecoveryDialog(window, failureDescription);
    return;
  }

  rendererRecoveryAttempts += 1;
  pendingRendererRecovery = {
    source,
    reason: details?.reason,
    exitCode: details?.exitCode,
  };
  rendererRecoveryReloading = true;

  try {
    if (source === "unresponsive") {
      rendererRecoveryCrashExpected = true;
      window.webContents.forcefullyCrashRenderer();
    }
    window.webContents.reloadIgnoringCache();
  } catch (error) {
    rendererRecoveryCrashExpected = false;
    rendererRecoveryReloading = false;
    logStartup("Failed to reload renderer after failure.", error);
    showRendererRecoveryDialog(window, failureDescription);
  }
}

app.commandLine.appendSwitch("ignore-gpu-blacklist"); // Ensures GPU usage on more machines
app.commandLine.appendSwitch("enable-gpu-rasterization"); // Improves rendering of vector shapes and drawings
app.commandLine.appendSwitch("enable-zero-copy"); // Improves texture write speed (good for Canvas)
app.commandLine.appendSwitch("enable-features", "SharedArrayBuffer"); // Crucial for WASM multithread

function createSplashWindow() {
  splash = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashPath = VITE_DEV_SERVER_URL
    ? path.join(process.env.VITE_PUBLIC!, "splash.html")
    : path.join(RENDERER_DIST, "splash.html");

  splash.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logStartup(
      `Splash screen failed to load (${errorCode}: ${errorDescription}) at ${validatedURL}.`,
    );
  });

  splash.loadFile(splashPath).catch((error) => {
    logStartup("Splash screen load failed.", error);
  });
}

function createMenu(
  hasProject = false,
  showRulers = true,
  showGuides = true,
  snapToGuides = true,
  snapToLayers = true,
  updateStatus = "",
) {
  // const isDev = !!VITE_DEV_SERVER_URL;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click: () => win?.webContents.send("menu:action", "new-project"),
        },
        { type: "separator" },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => win?.webContents.send("menu:action", "open-project"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "save-project"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "save-project-as"),
        },
        { type: "separator" },
        {
          label: "Export...",
          accelerator: "CmdOrCtrl+Shift+E",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "open-export-modal"),
        },
        {
          label: "Export to Clipboard",
          accelerator: "CmdOrCtrl+Shift+C",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "export-to-clipboard"),
        },
        { type: "separator" },
        {
          label: "Close Project",
          accelerator: "CmdOrCtrl+W",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "close-project"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          enabled: true,
          click: () => win?.webContents.send("menu:action", "undo"),
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          enabled: true,
          click: () => win?.webContents.send("menu:action", "redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        {
          label: "Preferences...",
          accelerator: "CmdOrCtrl+,",
          click: () => win?.webContents.send("menu:action", "preferences"),
        },
      ],
    },
    {
      label: "Image",
      submenu: [
        {
          label: "Image Size...",
          accelerator: "CmdOrCtrl+Alt+I",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "open-image-size-modal"),
        },
        { type: "separator" },
        {
          label: "Rotate Image",
          enabled: hasProject,
          submenu: [
            {
              label: "90° Clockwise",
              click: () => win?.webContents.send("menu:action", "rotate-90-cw"),
            },
            {
              label: "90° Counter-Clockwise",
              click: () => win?.webContents.send("menu:action", "rotate-90-ccw"),
            },
            {
              label: "180°",
              click: () => win?.webContents.send("menu:action", "rotate-180"),
            },
          ],
        },
        {
          label: "Flip Image",
          enabled: hasProject,
          submenu: [
            {
              label: "Horizontal",
              click: () => win?.webContents.send("menu:action", "flip-horizontal"),
            },
            {
              label: "Vertical",
              click: () => win?.webContents.send("menu:action", "flip-vertical"),
            },
          ],
        },
      ],
    },
    {
      label: "Layer",
      submenu: [
        {
          label: "New Layer",
          accelerator: "CmdOrCtrl+Shift+N",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "add-layer"),
        },
        {
          label: "Duplicate Layer",
          accelerator: "CmdOrCtrl+J",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "duplicate-layer"),
        },
        {
          label: "Merge Layer(s)",
          accelerator: "CmdOrCtrl+E",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "merge-layers"),
        },
        { type: "separator" },
        {
          label: "Delete Layer",
          accelerator: "Backspace",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "remove-layer"),
        },
      ],
    },
    {
      label: "Select",
      submenu: [
        {
          label: "All",
          accelerator: "CmdOrCtrl+A",
          enabled: true,
          click: () => win?.webContents.send("menu:action", "select-all"),
        },
        {
          label: "Deselect",
          accelerator: "CmdOrCtrl+D",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "deselect"),
        },
      ],
    },
    { label: "Filter", submenu: [{ label: "Blur", enabled: false }] },
    {
      label: "View",
      submenu: [
        // ...(isDev
        //   ? ([
        //       { role: "toggleDevTools", accelerator: "CmdOrCtrl+Alt+Shift+I" },
        //       { type: "separator" },
        //     ] as Electron.MenuItemConstructorOptions[])
        //   : []),
        { role: "toggleDevTools", accelerator: "CmdOrCtrl+Alt+Shift+I" },
        { type: "separator" },
        {
          label: "Rulers",
          accelerator: "CmdOrCtrl+R",
          type: "checkbox",
          checked: showRulers,
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "toggle-rulers"),
        },
        {
          label: "Guides",
          accelerator: "CmdOrCtrl+;",
          type: "checkbox",
          checked: showGuides,
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "toggle-guides"),
        },
        {
          label: "Snap to",
          enabled: hasProject,
          submenu: [
            {
              label: "Guides",
              type: "checkbox",
              checked: snapToGuides,
              click: () => win?.webContents.send("menu:action", "toggle-snap-guides"),
            },
            {
              label: "Layers",
              type: "checkbox",
              checked: snapToLayers,
              click: () => win?.webContents.send("menu:action", "toggle-snap-layers"),
            },
          ],
        },
        { type: "separator" },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "zoom-in"),
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "zoom-out"),
        },
        { type: "separator" },
        {
          label: "Actual Size",
          accelerator: "CmdOrCtrl+1",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "zoom-100"),
        },
        {
          label: "Fit to Screen",
          accelerator: "CmdOrCtrl+0",
          enabled: hasProject,
          click: () => win?.webContents.send("menu:action", "zoom-fit"),
        },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }] },
    {
      label: "Help",
      submenu: [
        {
          label: "About OpenCreate Forge",
          click: () => win?.webContents.send("menu:action", "about"),
        },
        {
          label: "Check for Updates...",
          enabled:
            updateStatus === "" ||
            updateStatus === "done" ||
            updateStatus === "up-to-date" ||
            updateStatus.startsWith("error:")
              ? true
              : false,
          click: () => {
            if (win) checkForUpdates(win);
          },
        },
        { type: "separator" },
        {
          label: "View on GitHub",
          click: () => shell.openExternal("https://github.com/opencreate-app/forge"),
        },
        {
          label: "Report an Issue",
          click: () => shell.openExternal("https://github.com/opencreate-app/forge/issues"),
        },
        {
          label: "Latest Release",
          click: () =>
            shell.openExternal("https://github.com/opencreate-app/forge/releases/latest"),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const iconPath =
    process.platform === "win32"
      ? path.join(APP_ROOT, "shared/favicon/favicon-windows.ico")
      : process.platform === "linux"
        ? path.join(APP_ROOT, "shared/favicon/favicon-linux.png")
        : undefined;

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#1a1a1a",
    center: true,
    darkTheme: true,
    ...(iconPath ? { icon: iconPath } : {}),
    show: false, // Start hidden, show when ready
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        "--disable-pinch", // Own zoom handling
        "--force-color-profile=srgb", // More consistent colors between platforms
      ],
    },
  });

  win.on("close", (event) => {
    if (safeQuitInProgress) return;

    event.preventDefault();
    requestSafeQuit();
  });

  // const startTime = Date.now();

  // Show splash screen until main window is ready
  win.once("ready-to-show", () => {
    // const elapsedTime = Date.now() - startTime;
    // const minimumDelay = 2000;
    // const remainingTime = Math.max(0, minimumDelay - elapsedTime);

    setTimeout(() => {
      if (splash) {
        splash.close();
        splash = null;
      }
      win?.show();
      win?.maximize();
    }, 1000);
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    logStartup("Renderer finished loading.");
    if (pendingRendererRecovery) {
      win?.webContents.send("app:renderer-recovered", pendingRendererRecovery);
      pendingRendererRecovery = null;
    }
    markRendererStable();
    win?.webContents.send("main-process-message", new Date().toLocaleString());

    // Auto-update check (with delay to avoid competing with splash/load)
    setTimeout(() => {
      if (win) checkForUpdates(win);
    }, 5000);
  });

  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logStartup(
        `Renderer failed to load (${errorCode}: ${errorDescription}) at ${validatedURL}; main frame: ${isMainFrame}.`,
      );
    },
  );

  win.webContents.on("render-process-gone", (_event, details) => {
    const failureDescription = describeRendererFailure("render-process-gone", details);
    logStartup(`Renderer process exited: ${failureDescription}.`);

    if (rendererRecoveryCrashExpected) {
      rendererRecoveryCrashExpected = false;
      rendererRecoveryReloading = false;
      return;
    }

    rendererRecoveryReloading = false;

    recoverRenderer(win!, "render-process-gone", details);
  });

  win.webContents.on("unresponsive", () => {
    recoverRenderer(win!, "unresponsive");
  });

  win.webContents.on("responsive", () => {
    logStartup("Renderer became responsive again.");
    markRendererStable();
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL).catch((error) => {
      logStartup("Main window URL load failed.", error);
    });
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html")).catch((error) => {
      logStartup("Main window file load failed.", error);
    });
  }

  createMenu();
  // win.setAutoHideMenuBar(true);
}

function requestSafeQuit() {
  if (safeQuitRequestInFlight) return;

  if (!win || win.isDestroyed()) {
    safeQuitInProgress = true;
    app.quit();
    return;
  }

  safeQuitRequestInFlight = true;
  win.webContents.send("app:request-safe-quit");
}

app.on("before-quit", (event) => {
  if (safeQuitInProgress) return;

  event.preventDefault();
  requestSafeQuit();
});

app.on("window-all-closed", () => {
  app.quit();
  win = null;
  // if (process.platform !== 'darwin') {}
});

app.on("child-process-gone", (_event, details) => {
  logStartup(
    `Electron child process exited (${details.type}, ${details.reason}, exit code ${details.exitCode}).`,
  );
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app
  .whenReady()
  .then(() => {
    logStartup(
      `Application ready. Version: ${app.getVersion()}, platform: ${process.platform}, arch: ${process.arch}.`,
    );

    // IPC Handlers
    ipcMain.handle("dialog:openFile", async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
      });
      if (canceled) return null;
      return filePaths[0];
    });

    ipcMain.handle("app:updateMenu", (_event, state) => {
      menuState = { ...menuState, ...state };

      createMenu(
        menuState.hasProject,
        menuState.showRulers,
        menuState.showGuides,
        menuState.snapToGuides,
        menuState.snapToLayers,
      );
    });

    ipcMain.on("main:update-status-changed", (_event, newStatus: string) => {
      menuState.updateStatus = newStatus;

      createMenu(
        menuState.hasProject,
        menuState.showRulers,
        menuState.showGuides,
        menuState.snapToGuides,
        menuState.snapToLayers,
        menuState.updateStatus,
      );
    });

    ipcMain.handle("dialog:saveFile", async (_event, { dataURL, defaultName, filters }) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Export image",
        defaultPath: defaultName || "export.png",
        filters: filters || [
          { name: "PNG", extensions: ["png"] },
          { name: "JPEG", extensions: ["jpg", "jpeg"] },
        ],
      });
      if (canceled || !filePath) return { success: false };

      const matches = dataURL.match(/^data:(.+);base64,(.+)$/);
      if (!matches) return { success: false, error: "Invalid dataURL format" };

      const buffer = Buffer.from(matches[2], "base64");
      try {
        await fs.writeFile(filePath, buffer);
        return { success: true, filePath };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("app:getVersion", () => app.getVersion());

    ipcMain.handle("clipboard:writeText", (_event, text: string) => {
      clipboard.writeText(text);
      return true;
    });

    ipcMain.handle("app:force-refresh", (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow || senderWindow.isDestroyed()) return false;

      senderWindow.webContents.reloadIgnoringCache();
      return true;
    });

    ipcMain.on("debug:crash-renderer", (event) => {
      if (!VITE_DEV_SERVER_URL) {
        logStartup("Ignored renderer crash request outside development.");
        return;
      }

      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow || senderWindow.isDestroyed()) {
        logStartup("Ignored renderer crash request from an unavailable window.");
        return;
      }

      logStartup("Forcing renderer crash from DevTools.");
      try {
        senderWindow.webContents.forcefullyCrashRenderer();
      } catch (error) {
        logStartup("Failed to force renderer crash from DevTools.", error);
      }
    });

    ipcMain.handle("shell:openExternal", (_event, url: string) => {
      // Allowlist only http/https URLs to prevent arbitrary protocol execution
      if (url.startsWith("https://") || url.startsWith("http://")) {
        shell.openExternal(url);
      }
    });

    ipcMain.handle("dialog:saveProjectAs", async (_event, { jsonString, defaultName }) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Project As...",
        defaultPath: defaultName || "project.ocfd",
        filters: [{ name: "OpenCreate Forge Document", extensions: ["ocfd"] }],
      });
      if (canceled || !filePath) return { success: false, filePath: null };

      try {
        const projectData = JSON.parse(jsonString);
        const name = path.basename(filePath, ".ocfd");

        // Clean up internal-only fields before saving to disk
        const dataToSave = { ...projectData };
        delete dataToSave.filePath;
        delete dataToSave.isDirty;
        dataToSave.name = name;
        dataToSave.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
        const stats = await fs.stat(filePath);

        return {
          success: true,
          filePath,
          name,
          fileSize: stats.size,
          updatedAt: dataToSave.updatedAt,
        };
      } catch (err: any) {
        return { success: false, error: err.message, filePath: null };
      }
    });

    ipcMain.handle("fs:saveProject", async (_event, { jsonString, filePath }) => {
      if (!filePath) return { success: false, error: "No file path provided." };
      try {
        const projectData = JSON.parse(jsonString);

        // Clean up internal-only fields before saving to disk
        const dataToSave = { ...projectData };
        delete dataToSave.filePath;
        delete dataToSave.isDirty;
        dataToSave.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
        const stats = await fs.stat(filePath);

        return {
          success: true,
          filePath,
          fileSize: stats.size,
          updatedAt: dataToSave.updatedAt,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("fs:saveImage", async (_event, { dataURL, filePath }) => {
      if (!filePath) return { success: false, error: "No file path provided." };

      const matches = dataURL.match(/^data:(.+);base64,(.+)$/);
      if (!matches) return { success: false, error: "Invalid dataURL format" };

      const buffer = Buffer.from(matches[2], "base64");
      try {
        await fs.writeFile(filePath, buffer);
        const stats = await fs.stat(filePath);

        return {
          success: true,
          filePath,
          fileSize: stats.size,
          updatedAt: new Date().toISOString(),
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("dialog:confirmClose", async (_event, projectName) => {
      const { response } = await dialog.showMessageBox({
        type: "question",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        message: `Do you want to save the changes to "${projectName}"?`,
        detail: "Your changes will be lost if you don't save them.",
      });
      return response;
    });

    ipcMain.handle("dialog:confirmCloseAll", async (_event, projectCount: number) => {
      const { response } = await dialog.showMessageBox({
        type: "question",
        buttons: ["Save All", "Don't Save", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        message: "You have unsaved changes.",
        detail: `${projectCount} project${projectCount === 1 ? " has" : "s have"} unsaved changes.`,
      });
      return response;
    });

    ipcMain.handle("app:respond-safe-quit", (_event, approved: boolean) => {
      safeQuitRequestInFlight = false;

      if (!approved) return { success: true, approved: false };

      safeQuitInProgress = true;
      app.quit();
      return { success: true, approved: true };
    });

    ipcMain.handle("fs:openProjectFromPath", async (_event, filePath) => {
      if (!filePath) return { success: false, error: "No file path provided." };
      try {
        const content = await fs.readFile(filePath, "utf8");
        return { success: true, filePath, content };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("fs:deleteFile", async (_event, filePath) => {
      try {
        await shell.trashItem(filePath);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("fs:renameFile", async (_event, { oldPath, newPath }) => {
      try {
        await fs.rename(oldPath, newPath);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle("dialog:openProject", async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "Open Project or Image",
        properties: ["openFile"],
        filters: [
          {
            name: "All Supported Files",
            extensions: ["ocfd", "png", "jpg", "jpeg", "bmp", "webp"],
          },
          { name: "OpenCreate Forge Document", extensions: ["ocfd"] },
          { name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "webp"] },
        ],
      });
      if (canceled || !filePaths[0]) return null;

      const filePath = filePaths[0];
      const ext = path.extname(filePath).toLowerCase();

      try {
        if (ext === ".ocfd") {
          const content = await fs.readFile(filePath, "utf8");
          return { success: true, filePath, type: "project", content };
        } else {
          // It's an image
          const buffer = await fs.readFile(filePath);
          const mimeType =
            {
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".bmp": "image/bmp",
              ".webp": "image/webp",
            }[ext] || "image/png";

          const dataURL = `data:${mimeType};base64,${buffer.toString("base64")}`;
          return { success: true, filePath, type: "image", dataURL };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    // Auto-Update Handlers
    ipcMain.handle("forge:update-download", async (_event, { version, assetName }) => {
      if (win) downloadUpdate(win, version, assetName);
    });

    ipcMain.handle("forge:update-open-release-page", (_event, url: string) => {
      if (url.startsWith("https://github.com/")) {
        shell.openExternal(url);
      }
    });

    ipcMain.handle("forge:update-install", async (_event, filePath: string) => {
      // Only allow opening paths within the temp directory for security
      const tempDir = app.getPath("temp");
      if (filePath.startsWith(tempDir)) {
        shell.openPath(filePath);
      }
    });

    createSplashWindow();
    createWindow();
  })
  .catch((error) => {
    logStartup("Application initialization failed.", error);
    dialog.showErrorBox("OpenCreate Forge could not start", formatError(error));
    app.exit(1);
  });
