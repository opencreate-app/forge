/**
 * Purpose: Preload script that exposes Electron APIs and IPC communication to the renderer process in a secure way.
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  saveFile: (data: any) => ipcRenderer.invoke("dialog:saveFile", data),
  saveProjectAs: (data: any) => ipcRenderer.invoke("dialog:saveProjectAs", data),
  saveProject: (data: any) => ipcRenderer.invoke("fs:saveProject", data),
  saveImage: (data: any) => ipcRenderer.invoke("fs:saveImage", data),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  confirmClose: (projectName: string) => ipcRenderer.invoke("dialog:confirmClose", projectName),
  confirmCloseAll: (projectCount: number) =>
    ipcRenderer.invoke("dialog:confirmCloseAll", projectCount),
  respondToSafeQuit: (approved: boolean) => ipcRenderer.invoke("app:respond-safe-quit", approved),
  onSafeQuitRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:request-safe-quit", listener);
    return () => ipcRenderer.removeListener("app:request-safe-quit", listener);
  },
  openProject: () => ipcRenderer.invoke("dialog:openProject"),
  openProjectFromPath: (filePath: string) => ipcRenderer.invoke("fs:openProjectFromPath", filePath),
  deleteFile: (filePath: string) => ipcRenderer.invoke("fs:deleteFile", filePath),
  renameFile: (data: { oldPath: string; newPath: string }) =>
    ipcRenderer.invoke("fs:renameFile", data),
  getAppVersion: () => ipcRenderer.invoke("app:getVersion"),
  forceRefresh: () => ipcRenderer.invoke("app:force-refresh"),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  updateMenu: (data: {
    hasProject: boolean;
    showRulers?: boolean;
    showGuides?: boolean;
    snapToGuides?: boolean;
    snapToLayers?: boolean;
  }) => ipcRenderer.invoke("app:updateMenu", data),
  onProjectDropped: (callback: any) => {
    window.addEventListener("project-dropped", (event: any) => callback(event.detail));
  },
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: any, action: string) => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => {
      ipcRenderer.removeListener("menu:action", listener);
    };
  },
  // Auto-Update Events
  onUpdateAvailable: (callback: (info: any) => void) => {
    const listener = (_event: any, info: any) => callback(info);
    ipcRenderer.on("forge:update-available", listener);
    return () => ipcRenderer.removeListener("forge:update-available", listener);
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number }) => void) => {
    const listener = (_event: any, progress: { percent: number }) => callback(progress);
    ipcRenderer.on("forge:update-download-progress", listener);
    return () => ipcRenderer.removeListener("forge:update-download-progress", listener);
  },
  onUpdateDownloadComplete: (callback: (data: { filePath: string }) => void) => {
    const listener = (_event: any, data: { filePath: string }) => callback(data);
    ipcRenderer.on("forge:update-download-complete", listener);
    return () => ipcRenderer.removeListener("forge:update-download-complete", listener);
  },
  onUpdateDownloadError: (callback: (data: { message: string }) => void) => {
    const listener = (_event: any, data: { message: string }) => callback(data);
    ipcRenderer.on("forge:update-download-error", listener);
    return () => ipcRenderer.removeListener("forge:update-download-error", listener);
  },
  // Auto-Update Invokes
  downloadUpdate: (data: { version: string; assetName: string }) =>
    ipcRenderer.invoke("forge:update-download", data),
  openReleasePage: (url: string) => ipcRenderer.invoke("forge:update-open-release-page", url),
  installUpdate: (filePath: string) => ipcRenderer.invoke("forge:update-install", filePath),
});
