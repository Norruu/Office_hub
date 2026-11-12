"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("officeHub", {
  launch: (systemId) => electron.ipcRenderer.invoke("launch-system", systemId),
  getLaunchTargets: () => electron.ipcRenderer.invoke("get-launch-targets"),
  chooseProgram: (systemId) => electron.ipcRenderer.invoke("choose-program", systemId),
  setUrlTarget: (systemId, url) => electron.ipcRenderer.invoke("set-url-target", systemId, url),
  clearTarget: (systemId) => electron.ipcRenderer.invoke("clear-launch-target", systemId),
  getServerUrl: () => electron.ipcRenderer.invoke("get-server-url"),
  setServerUrl: (url) => electron.ipcRenderer.invoke("set-server-url", url),
  detectPrograms: (token) => electron.ipcRenderer.invoke("detect-programs", token),
  useDetectedProgram: (systemId, token) => electron.ipcRenderer.invoke("use-detected-program", systemId, token),
  getDeviceInfo: () => electron.ipcRenderer.invoke("get-device-info"),
  checkTargets: () => electron.ipcRenderer.invoke("check-targets"),
  platform: process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : "other",
  downloadInstaller: (systemId, platform, token) => electron.ipcRenderer.invoke("download-installer", systemId, platform, token),
  runInstaller: (systemId) => electron.ipcRenderer.invoke("run-installer", systemId),
  showInstaller: (systemId) => electron.ipcRenderer.invoke("show-installer", systemId),
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("download-progress", handler);
    return () => {
      electron.ipcRenderer.removeListener("download-progress", handler);
    };
  },
  getAppVersion: () => electron.ipcRenderer.invoke("get-app-version"),
  getUpdateState: () => electron.ipcRenderer.invoke("get-update-state"),
  checkForUpdates: () => electron.ipcRenderer.invoke("check-for-updates"),
  applyUpdate: () => electron.ipcRenderer.invoke("apply-update"),
  onUpdateState: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("update-state", handler);
    return () => {
      electron.ipcRenderer.removeListener("update-state", handler);
    };
  }
});
