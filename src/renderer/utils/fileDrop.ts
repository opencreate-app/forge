/**
 * Purpose: Shared file helpers for drag-and-drop imports across the renderer.
 */

export const isForgeProjectFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith(".ocfd");

interface FileDropElectronAPI {
  getPathForFile?: (file: File) => string;
}

export const getDroppedFilePath = (file: File): string | undefined => {
  const electronAPI = (window as Window & { electronAPI?: FileDropElectronAPI }).electronAPI;
  return typeof electronAPI?.getPathForFile === "function"
    ? electronAPI.getPathForFile(file)
    : undefined;
};

export const getFileNameWithoutExtension = (file: File): string =>
  file.name.replace(/\.[^/.]+$/, "");

export const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
