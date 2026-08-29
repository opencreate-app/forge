import { app, BrowserWindow, net, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";

interface InstallContext {
  platform: "win32" | "darwin" | "linux";
  arch: "x64" | "arm64";
  isPortable: boolean;
  assetName: string | null;
}

export interface UpdateAvailablePayload {
  version: string;
  releaseUrl: string;
  isPortable: boolean;
  assetName: string | null;
}

/**
 * Detects the installation context to determine if the app is portable
 * and which asset name to look for in GitHub releases.
 */
function detectInstallContext(): InstallContext {
  const platform = process.platform as "win32" | "darwin" | "linux";
  const arch = process.arch as "x64" | "arm64";
  let isPortable = false;
  let assetName: string | null = null;

  if (platform === "win32") {
    isPortable = process.env.PORTABLE_EXECUTABLE_DIR !== undefined;
    assetName = `OpenCreate.Forge.Setup.{version}.exe`;
  } else if (platform === "darwin") {
    // Basic check for macOS: if it's not in /Applications, we treat it as portable/manual update
    isPortable = !app.getAppPath().startsWith("/Applications");
    assetName =
      arch === "arm64" ? `OpenCreate.Forge-{version}-arm64.dmg` : `OpenCreate.Forge-{version}.dmg`;
  } else if (platform === "linux") {
    if (process.env.APPIMAGE) {
      isPortable = false; // AppImage can be "updated" by replacing the file
      assetName = `OpenCreate.Forge-{version}.AppImage`;
    } else {
      // Deb or RPM? Check installation path
      const isSystemInstall =
        app.getAppPath().startsWith("/opt") || app.getAppPath().startsWith("/usr");
      isPortable = !isSystemInstall;

      // We'll default to .deb if we can't be sure, but usually we need one specific asset
      // For simplicity in this implementation, we check for .deb
      assetName = `opencreate-forge_{version}_amd64.deb`;
    }
  }

  // Fallback for safety
  if (isPortable) assetName = null;

  console.log("[AutoUpdater] Detection:", { platform, arch, isPortable, assetName });

  return { platform, arch, isPortable, assetName };
}

/**
 * Compares two semver versions.
 * Returns true if v1 > v2.
 */
function isNewer(v1: string, v2: string): boolean {
  const p1 = v1.split(".").map((n) => parseInt(n, 10));
  const p2 = v2.split(".").map((n) => parseInt(n, 10));

  for (let i = 0; i < 3; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return true;
    if (n1 < n2) return false;
  }
  return false;
}

/**
 * Checks for updates via GitHub Releases API.
 */
function setStatusAndRefreshMenu(win: BrowserWindow, status: string) {
  // Dispara o evento interno mapeado no main.ts passando o novo status
  ipcMain.emit("main:update-status-changed", null, status);
}

export async function checkForUpdates(win: BrowserWindow) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  setStatusAndRefreshMenu(win, "checking");

  await sleep(1000);

  // Skip check in development
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log("[AutoUpdater] Skipping update check in development mode.");
    setStatusAndRefreshMenu(win, "");
    return;
  }

  const context = detectInstallContext();
  const currentVersion = app.getVersion();
  console.log(`[AutoUpdater] Checking for updates... (Current version: v${currentVersion})`);

  try {
    const request = net.request({
      method: "GET",
      protocol: "https:",
      hostname: "api.github.com",
      path: "/repos/opencreate-app/forge/releases/latest",
      headers: {
        "User-Agent": "OpenCreate-Forge-AutoUpdater",
      },
    });

    request.on("response", (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        if (response.statusCode !== 200) {
          setStatusAndRefreshMenu(win, `error:gh-api-status-${response.statusCode}`);
          console.error(`[AutoUpdater] GitHub API returned status ${response.statusCode}`);
          return;
        }

        try {
          const release = JSON.parse(data);
          const latestVersion = release.tag_name.replace(/^v/, "");
          console.log(`[AutoUpdater] Latest version on GitHub: v${latestVersion}`);

          // Proper semver comparison
          if (isNewer(latestVersion, currentVersion)) {
            setStatusAndRefreshMenu(win, "update-available");
            console.log("[AutoUpdater] New version available!");
            const payload: UpdateAvailablePayload = {
              version: latestVersion,
              releaseUrl: release.html_url,
              isPortable: context.isPortable,
              assetName: context.assetName
                ? context.assetName.replace("{version}", latestVersion)
                : null,
            };
            win.webContents.send("forge:update-available", payload);
          } else {
            setStatusAndRefreshMenu(win, "up-to-date");
            console.log("[AutoUpdater] App is up to date.");
          }
        } catch (_e) {
          setStatusAndRefreshMenu(win, "error:gh-api-response-parse");
          console.error("[AutoUpdater] Failed to parse GitHub API response.");
        }
      });
    });

    request.on("error", (err) => {
      setStatusAndRefreshMenu(win, "error:network-on-check");
      console.error(`[AutoUpdater] Network error during update check: ${err.message}`);
    });

    request.end();
  } catch (_error) {
    setStatusAndRefreshMenu(win, "error:unexpected-on-check");
    console.error("[AutoUpdater] Unexpected error during update check.");
  }
}

/**
 * Downloads the update asset from GitHub.
 */
export async function downloadUpdate(win: BrowserWindow, version: string, assetName: string) {
  const url = `https://github.com/opencreate-app/forge/releases/download/v${version}/${encodeURIComponent(assetName)}`;
  const tempPath = app.getPath("temp");
  const filePath = path.join(tempPath, assetName);

  setStatusAndRefreshMenu(win, "downloading");
  console.log(`[AutoUpdater] Starting download: ${url}`);
  console.log(`[AutoUpdater] Target path: ${filePath}`);

  try {
    const request = net.request({
      url,
      redirect: "follow",
    });

    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        setStatusAndRefreshMenu(win, `error:download-failed-status-${response.statusCode}`);
        console.error(`[AutoUpdater] Download failed with status ${response.statusCode}`);
        win.webContents.send("forge:update-download-error", {
          message: `Failed to download: HTTP ${response.statusCode}`,
        });
        return;
      }

      const totalBytes = parseInt(response.headers["content-length"] as string, 10);
      let downloadedBytes = 0;

      const fileStream = fs.createWriteStream(filePath);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        fileStream.write(chunk);

        if (totalBytes) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          win.webContents.send("forge:update-download-progress", { percent });
        }
      });

      response.on("end", () => {
        fileStream.end();
        console.log(`[AutoUpdater] Download complete: ${filePath}`);
        win.webContents.send("forge:update-download-complete", { filePath });
      });

      response.on("error", (err) => {
        setStatusAndRefreshMenu(win, `error:writing-file`);
        console.error(`[AutoUpdater] Error writing to file: ${err.message}`);
        fileStream.destroy();
        win.webContents.send("forge:update-download-error", { message: err.message });
      });
    });

    request.on("error", (err) => {
      setStatusAndRefreshMenu(win, `error:network-on-download`);
      console.error(`[AutoUpdater] Network error during download: ${err.message}`);
      win.webContents.send("forge:update-download-error", { message: err.message });
    });

    request.end();
  } catch (error: any) {
    setStatusAndRefreshMenu(win, `error:unexpected-on-download`);
    console.error(`[AutoUpdater] Unexpected download error: ${error.message}`);
    win.webContents.send("forge:update-download-error", { message: error.message });
  }
}
