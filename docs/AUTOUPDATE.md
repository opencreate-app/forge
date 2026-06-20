# Auto-Update via GitHub Releases

Implementar verificação automática de atualizações com download inteligente: ao iniciar, o app consulta o GitHub Releases API, e se houver nova versão, mostra a barra. "Update Now" baixa automaticamente o instalador correto para o OS/arch do usuário — exceto em instalações portables, onde abre o navegador.

## Proposed Changes

---

### Main Process

#### [NEW] [autoUpdater.ts](/src/main/autoUpdater.ts)

Módulo com três responsabilidades:

**1. `checkForUpdates(win)`** — Verificação de versão via GitHub API

- Endpoint: `GET https://api.github.com/repos/opencreate-app/forge/releases/latest`
- Compara `tag_name` (ex: `v0.3.0`) com `app.getVersion()` via semver simples
- Se houver update, envia `forge:update-available` com payload:
  ```ts
  {
    version: string,       // "0.3.0"
    releaseUrl: string,    // URL da página da release no GitHub
    isPortable: boolean,   // true = só abre browser; false = download automático
  }
  ```
- Em dev (`VITE_DEV_SERVER_URL`), **pula** a verificação
- Silencia todos os erros de rede — o app funciona normalmente

**2. `detectInstallContext(): InstallContext`** — Detecção de ambiente

```ts
type InstallContext = {
  platform: "win32" | "darwin" | "linux";
  arch: "x64" | "arm64";
  isPortable: boolean;
  assetName: string | null; // null = portable/fallback
};
```

Lógica de detecção por plataforma:

| Plataforma         | Sinal de "portable"                                 | Asset de download                             |
| ------------------ | --------------------------------------------------- | --------------------------------------------- |
| **Windows**        | `process.env.PORTABLE_EXECUTABLE_DIR !== undefined` | `OpenCreate.Forge.Setup.{version}.exe` (NSIS) |
| **macOS**          | App fora de `/Applications`                         | `OpenCreate.Forge-{version}{-arm64}.dmg`      |
| **Linux AppImage** | `process.env.APPIMAGE !== undefined`                | `OpenCreate.Forge-{version}.AppImage`         |
| **Linux deb**      | Instalado em `/opt` ou `/usr`                       | `opencreate-forge_{version}_amd64.deb`        |
| **Linux rpm**      | Instalado em `/opt` ou `/usr`                       | `opencreate-forge-{version}.x86_64.rpm`       |

> **Portable sempre → abre browser.** Casos edge (Windows portable EXE, macOS ZIP, Linux sem env var) usam `isPortable: true` como fallback seguro.

**3. `downloadUpdate(win, version, assetName)`** — Download com progresso

- Usa `net.request` do Electron (main process, não precisa de node `https`)
- Salva em `app.getPath('temp')`
- Emite `forge:update-download-progress` com `{ percent: number }` via `win.webContents.send`
- Ao concluir, emite `forge:update-download-complete` com `{ filePath: string }`
- Em caso de erro, emite `forge:update-download-error` com `{ message: string }`
- Suporta redirecionamentos HTTP (GitHub redireciona os assets)

---

#### [MODIFY] [main.ts](/src/main/main.ts)

- Importar `checkForUpdates` e `downloadUpdate` de `./autoUpdater`
- Invocar `checkForUpdates(win)` no `did-finish-load` com delay de ~5s
- Adicionar IPC handlers:
  - `forge:update-download` — recebe `{ version, assetName }` e inicia `downloadUpdate()`
  - `forge:update-open-release-page` — `shell.openExternal(releaseUrl)` (portable fallback)
  - `forge:update-install` — recebe `{ filePath }` e chama `shell.openPath(filePath)` para abrir o instalador

---

### Preload — IPC Bridge

#### [MODIFY] [preload.ts](/src/main/preload.ts)

Adicionar ao `electronAPI`:

```ts
// Main → Renderer (push events)
onUpdateAvailable: (cb: (info: UpdateAvailablePayload) => void) => () => void
onUpdateDownloadProgress: (cb: (progress: { percent: number }) => void) => () => void
onUpdateDownloadComplete: (cb: (data: { filePath: string }) => void) => () => void
onUpdateDownloadError: (cb: (data: { message: string }) => void) => () => void

// Renderer → Main (invoke)
downloadUpdate: (data: { version: string; assetName: string }) => Promise<void>
openReleasePage: (url: string) => Promise<void>
installUpdate: (filePath: string) => Promise<void>
```

Todos os listeners retornam cleanup function (padrão `onMenuAction` existente).

---

### Renderer — UI

#### [MODIFY] [App.tsx](/src/renderer/App.tsx)

**Tipagem (substituindo `any`):**

```ts
interface UpdateInfo {
  version: string;
  releaseUrl: string;
  isPortable: boolean;
  isClosed: boolean;
}
```

**Estado adicional:**

```ts
const [updateDownloadProgress, setUpdateDownloadProgress] = React.useState<number | null>(null);
// null = não baixando, 0-100 = progresso, -1 = erro
```

**`useEffect` para wiring dos IPC events:**

- `onUpdateAvailable` → `setIsUpdateAvailable({ ...info, isClosed: false })`
- `onUpdateDownloadProgress` → `setUpdateDownloadProgress(percent)`
- `onUpdateDownloadComplete` → `setUpdateDownloadProgress(null)` + `installUpdate(filePath)` (abre o instalador)
- `onUpdateDownloadError` → `setUpdateDownloadProgress(-1)` + `showToast("Download failed", "error")`

**"Update Now" button — comportamento condicional:**

- `isPortable = true` → `openReleasePage(releaseUrl)` (abre browser)
- `isPortable = false` e não está baixando → `downloadUpdate({ version, assetName })` + `setUpdateDownloadProgress(0)`
- Enquanto baixando → mostra barra de progresso inline no banner (ex: `Downloading... 47%`)
- Após download → o instalador é aberto automaticamente via `shell.openPath`

**Barra de progresso no banner** (dentro do `div` do update notification):

```tsx
{
  updateDownloadProgress !== null && updateDownloadProgress >= 0 && (
    <div
      className="absolute bottom-0 left-0 h-0.5 bg-white/60 transition-all"
      style={{ width: `${updateDownloadProgress}%` }}
    />
  );
}
```

---

## Resumo dos arquivos

| Arquivo                   | Ação    | Descrição                                                     |
| ------------------------- | ------- | ------------------------------------------------------------- |
| `src/main/autoUpdater.ts` | **NEW** | Check de versão, detecção de ambiente, download com progresso |
| `src/main/main.ts`        | MODIFY  | Startup check + 3 IPC handlers                                |
| `src/main/preload.ts`     | MODIFY  | Bridge para 4 eventos push + 3 invokes                        |
| `src/renderer/App.tsx`    | MODIFY  | Wiring IPC + barra de progresso no banner                     |

---

## Verification Plan

### Manual Verification

1. `npm run tsc` + `npm run lint` — zero erros
2. `npm run dev` → banner **não aparece** (skip em dev mode)
3. Testar banner: comentar o skip de dev e verificar animação, progress bar, botão close
4. Em produção: verificar que `assetName` é construído corretamente para cada OS

### Automated Tests

- `npm run check` — TypeScript + ESLint
