/**
 * Purpose: Electron main process script that handles window management, native menus, and IPC handlers for file operations and system dialogs.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkForUpdates, downloadUpdate } from "./autoUpdater.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
let menuState = {
  hasProject: false,
  showRulers: true,
  showGuides: true,
  snapToGuides: true,
  snapToLayers: true,
  updateStatus: "",
};

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

  splash.loadFile(splashPath);
}

function createMenu(
  hasProject = false,
  showRulers = true,
  showGuides = true,
  snapToGuides = true,
  snapToLayers = true,
  updateStatus = "",
) {
  const isDev = !!VITE_DEV_SERVER_URL;

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
          accelerator: "CmdOrCtrl+E",
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
        ...(isDev
          ? ([
              { role: "toggleDevTools", accelerator: "CmdOrCtrl+Alt+Shift+I" },
              { type: "separator" },
            ] as Electron.MenuItemConstructorOptions[])
          : []),
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
      : process.platform === "darwin"
        ? path.join(APP_ROOT, "shared/favicon/favicon-darwin-liquid.icns")
        : path.join(APP_ROOT, "shared/favicon/favicon-linux.png");

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#1a1a1a",
    center: true,
    darkTheme: true,
    icon: iconPath,
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
    win?.webContents.send("main-process-message", new Date().toLocaleString());

    // Auto-update check (with delay to avoid competing with splash/load)
    setTimeout(() => {
      if (win) checkForUpdates(win);
    }, 5000);
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }

  createMenu();
  // win.setAutoHideMenuBar(true);
}

app.on("window-all-closed", () => {
  app.quit();
  win = null;
  // if (process.platform !== 'darwin') {}
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
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
});
