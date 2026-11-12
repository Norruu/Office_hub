import { contextBridge, ipcRenderer } from "electron";

type Progress = { systemId: string; received: number; total: number };

contextBridge.exposeInMainWorld("officeHub", {
  launch: (systemId: string) => ipcRenderer.invoke("launch-system", systemId),
  getLaunchTargets: () => ipcRenderer.invoke("get-launch-targets"),
  chooseProgram: (systemId: string) =>
    ipcRenderer.invoke("choose-program", systemId),
  setUrlTarget: (systemId: string, url: string) =>
    ipcRenderer.invoke("set-url-target", systemId, url),
  clearTarget: (systemId: string) =>
    ipcRenderer.invoke("clear-launch-target", systemId),
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url: string) => ipcRenderer.invoke("set-server-url", url),

  detectPrograms: (token: string) =>
    ipcRenderer.invoke("detect-programs", token),
  useDetectedProgram: (systemId: string, token: string) =>
    ipcRenderer.invoke("use-detected-program", systemId, token),

  getDeviceInfo: () => ipcRenderer.invoke("get-device-info"),
  checkTargets: () => ipcRenderer.invoke("check-targets"),

  platform:
    process.platform === "win32"
      ? "windows"
      : process.platform === "linux"
        ? "linux"
        : "other",
  downloadInstaller: (systemId: string, platform: string, token: string) =>
    ipcRenderer.invoke("download-installer", systemId, platform, token),
  runInstaller: (systemId: string) =>
    ipcRenderer.invoke("run-installer", systemId),
  showInstaller: (systemId: string) =>
    ipcRenderer.invoke("show-installer", systemId),
  onDownloadProgress: (callback: (p: Progress) => void) => {
    const handler = (_event: unknown, data: Progress) => callback(data);
    ipcRenderer.on("download-progress", handler);
    return () => {
      ipcRenderer.removeListener("download-progress", handler);
    };
  },

  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getUpdateState: () => ipcRenderer.invoke("get-update-state"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  applyUpdate: () => ipcRenderer.invoke("apply-update"),
  onUpdateState: (callback: (state: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on("update-state", handler);
    return () => {
      ipcRenderer.removeListener("update-state", handler);
    };
  },
});
