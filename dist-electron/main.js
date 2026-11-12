import { app, ipcMain, BrowserWindow, dialog, shell, net, session, Menu } from "electron";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHash, X509Certificate, randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform, Readable } from "node:stream";
import { isIP } from "node:net";
import os from "node:os";
const targetsFile = () => path.join(app.getPath("userData"), "launch-targets.json");
function readTargets() {
  try {
    return JSON.parse(fs.readFileSync(targetsFile(), "utf-8"));
  } catch {
    return {};
  }
}
function writeTargets(targets) {
  fs.writeFileSync(targetsFile(), JSON.stringify(targets, null, 2) + "\n");
}
function validId$1(id) {
  return typeof id === "string" && id.length > 0 && id.length <= 100;
}
function parseWebUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
function registerLauncher() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  if (!fs.existsSync(targetsFile())) fs.writeFileSync(targetsFile(), "{}\n");
  console.log("Launch targets file:", targetsFile());
  ipcMain.handle("get-launch-targets", () => {
    const out = {};
    for (const [id, t] of Object.entries(readTargets())) {
      if (t.type === "exe") {
        out[id] = { type: "exe", value: typeof t.path === "string" ? t.path : "" };
      } else if (t.type === "url") {
        out[id] = { type: "url", value: typeof t.url === "string" ? t.url : "" };
      }
    }
    return out;
  });
  ipcMain.handle("choose-program", async (event, systemId) => {
    if (!validId$1(systemId)) return { ok: false, error: "Invalid request" };
    const options = {
      title: "Choose the program to launch",
      properties: ["openFile"],
      filters: process.platform === "win32" ? [
        { name: "Programs and shortcuts", extensions: ["exe", "lnk"] },
        { name: "All files", extensions: ["*"] }
      ] : void 0
    };
    const win2 = BrowserWindow.fromWebContents(event.sender);
    const picked = win2 ? await dialog.showOpenDialog(win2, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, cancelled: true };
    }
    let chosen = picked.filePaths[0];
    if (process.platform === "win32" && chosen.toLowerCase().endsWith(".lnk")) {
      try {
        chosen = shell.readShortcutLink(chosen).target;
      } catch {
        return { ok: false, error: "Could not read that shortcut" };
      }
    }
    if (!chosen || !path.isAbsolute(chosen) || !fs.existsSync(chosen)) {
      return { ok: false, error: "That program could not be found" };
    }
    const targets = readTargets();
    targets[systemId] = { type: "exe", path: chosen };
    writeTargets(targets);
    return { ok: true };
  });
  ipcMain.handle("set-url-target", (_event, systemId, value) => {
    if (!validId$1(systemId)) return { ok: false, error: "Invalid request" };
    const url = parseWebUrl(value);
    if (!url) return { ok: false, error: "Enter a full link starting with http:// or https://" };
    const targets = readTargets();
    targets[systemId] = { type: "url", url: url.toString() };
    writeTargets(targets);
    return { ok: true };
  });
  ipcMain.handle("clear-launch-target", (_event, systemId) => {
    if (!validId$1(systemId)) return { ok: false, error: "Invalid request" };
    const targets = readTargets();
    delete targets[systemId];
    writeTargets(targets);
    return { ok: true };
  });
  ipcMain.handle("launch-system", async (_event, systemId) => {
    if (!validId$1(systemId)) return { ok: false, error: "Invalid request" };
    const target = readTargets()[systemId];
    if (!target) return { ok: false, error: "No launch target on this computer" };
    if (target.type === "url") {
      const url = parseWebUrl(target.url);
      if (!url) return { ok: false, error: "Invalid link" };
      await shell.openExternal(url.toString());
      return { ok: true };
    }
    if (target.type === "exe") {
      if (typeof target.path !== "string" || !path.isAbsolute(target.path) || !fs.existsSync(target.path)) {
        return { ok: false, error: "Program not found" };
      }
      const args = target.args ?? [];
      if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) {
        return { ok: false, error: "Invalid arguments" };
      }
      return new Promise((resolve) => {
        const child = spawn(target.path, args, { detached: true, stdio: "ignore", shell: false });
        child.once("error", () => resolve({ ok: false, error: "Could not start program" }));
        child.once("spawn", () => {
          child.unref();
          resolve({ ok: true });
        });
      });
    }
    return { ok: false, error: "Unsupported target type" };
  });
}
const DEFAULT_URL = "http://localhost:3000";
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}
function cleanUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
function currentServerUrl() {
  const saved = cleanUrl(readJson(settingsFile()).serverUrl);
  if (saved) return saved;
  const bundled = cleanUrl(
    readJson(path.join(process.resourcesPath, "default-settings.json")).serverUrl
  );
  return bundled ?? DEFAULT_URL;
}
function registerSettings() {
  ipcMain.handle("get-server-url", () => currentServerUrl());
  ipcMain.handle("set-server-url", (_event, value) => {
    const url = cleanUrl(value);
    if (!url) {
      return { ok: false, error: "Enter a full address, like http://192.168.1.20:3000" };
    }
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ serverUrl: url }, null, 2) + "\n");
    return { ok: true, url };
  });
}
const ALLOWED_EXT = [".exe", ".msi", ".appimage", ".deb", ".rpm", ".tar.gz"];
const verified = /* @__PURE__ */ new Map();
const installerFolder = () => path.join(app.getPath("downloads"), "Office Hub");
function safeName(raw) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const name = path.basename(decoded).replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((e) => lower.endsWith(e)) ? name : null;
}
function registerInstaller() {
  ipcMain.handle(
    "download-installer",
    async (event, systemId, platform2, token) => {
      if (typeof systemId !== "string" || systemId.length === 0 || systemId.length > 100) {
        return { ok: false, error: "Invalid request" };
      }
      if (platform2 !== "windows" && platform2 !== "linux") {
        return { ok: false, error: "Invalid request" };
      }
      if (typeof token !== "string" || token.length === 0 || token.length > 200) {
        return { ok: false, error: "Invalid request" };
      }
      const url = `${currentServerUrl()}/api/systems/${encodeURIComponent(systemId)}/installer/download?platform=${platform2}`;
      const res = await net.fetch(url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!res) return { ok: false, error: "Could not reach the server." };
      if (res.status === 401) {
        return { ok: false, unauthorized: true, error: "Your session expired. Please log in again." };
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error ?? "The server refused the download." };
      }
      const expected = (res.headers.get("x-installer-sha256") ?? "").toLowerCase();
      const total = Number(res.headers.get("content-length") ?? 0);
      const name = safeName(res.headers.get("x-installer-filename") ?? "");
      if (!/^[0-9a-f]{64}$/.test(expected) || !name) {
        return { ok: false, error: "The server sent an unexpected reply." };
      }
      fs.mkdirSync(installerFolder(), { recursive: true });
      const finalPath = path.join(installerFolder(), name);
      const partPath = finalPath + ".part";
      const hash = createHash("sha256");
      let received = 0;
      let lastSent = 0;
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          received += chunk.length;
          const now = Date.now();
          if (now - lastSent > 100 && !event.sender.isDestroyed()) {
            lastSent = now;
            event.sender.send("download-progress", { systemId, received, total });
          }
          cb(null, chunk);
        }
      });
      try {
        await pipeline(
          Readable.fromWeb(res.body),
          meter,
          fs.createWriteStream(partPath)
        );
      } catch {
        fs.rmSync(partPath, { force: true });
        return { ok: false, error: "The download was interrupted. Please try again." };
      }
      if (hash.digest("hex") !== expected) {
        fs.rmSync(partPath, { force: true });
        return {
          ok: false,
          error: "The file failed its safety check, so it was deleted. Please tell your master."
        };
      }
      try {
        fs.rmSync(finalPath, { force: true });
        fs.renameSync(partPath, finalPath);
      } catch {
        fs.rmSync(partPath, { force: true });
        return { ok: false, error: "Could not save the file. Is an older copy still open?" };
      }
      verified.set(systemId, finalPath);
      if (!event.sender.isDestroyed()) {
        event.sender.send("download-progress", { systemId, received: total, total });
      }
      return { ok: true };
    }
  );
  ipcMain.handle("run-installer", async (_event, systemId) => {
    const file = typeof systemId === "string" ? verified.get(systemId) : void 0;
    if (!file || !fs.existsSync(file)) {
      return { ok: false, error: "Download the installer first." };
    }
    if (process.platform !== "win32") {
      shell.showItemInFolder(file);
      return { ok: true };
    }
    const problem = await shell.openPath(file);
    return problem ? { ok: false, error: problem } : { ok: true };
  });
  ipcMain.handle("show-installer", (_event, systemId) => {
    const file = typeof systemId === "string" ? verified.get(systemId) : void 0;
    if (!file || !fs.existsSync(file)) return { ok: false, error: "No downloaded file found." };
    shell.showItemInFolder(file);
    return { ok: true };
  });
}
function loadCa() {
  const candidates = [
    path.join(process.resourcesPath, "office-ca.pem"),
    // installed app
    path.join(app.getAppPath(), "build-resources", "office-ca.pem")
    // development
  ];
  for (const file of candidates) {
    try {
      const ca = new X509Certificate(fs.readFileSync(file));
      if (ca.ca) return ca;
    } catch {
    }
  }
  return null;
}
function registerTrust() {
  const ca = loadCa();
  if (!ca) console.warn("office-ca.pem not found: HTTPS to the office server will not be trusted.");
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    if (!ca) return callback(-3);
    let serverHost;
    try {
      serverHost = new URL(currentServerUrl()).hostname;
    } catch {
      return callback(-3);
    }
    if (request.hostname !== serverHost) return callback(-3);
    try {
      const leaf = new X509Certificate(request.certificate.data);
      const now = Date.now();
      const timeOk = now >= Date.parse(leaf.validFrom) && now <= Date.parse(leaf.validTo) && now <= Date.parse(ca.validTo);
      const signedByOurCa = leaf.verify(ca.publicKey);
      const nameOk = isIP(serverHost) ? !!leaf.checkIP(serverHost) : !!leaf.checkHost(serverHost);
      callback(timeOk && signedByOurCa && nameOk ? 0 : -3);
    } catch {
      callback(-3);
    }
  });
}
const platform = process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : null;
let current = { state: "idle" };
let readyFile = null;
let busy = false;
const updatesDir = () => path.join(app.getPath("userData"), "updates");
function setState(next) {
  current = next;
  for (const win2 of BrowserWindow.getAllWindows()) {
    if (!win2.isDestroyed()) win2.webContents.send("update-state", current);
  }
}
function newer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    fs.createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject);
  });
}
async function check(manual) {
  if (!platform || busy || current.state === "ready") return current;
  busy = true;
  try {
    if (manual) setState({ state: "checking" });
    const base = currentServerUrl();
    const res = await net.fetch(`${base}/api/app-update?platform=${platform}`).catch(() => null);
    if (!res) {
      setState(manual ? { state: "error", message: "Could not reach the server." } : { state: "idle" });
      return current;
    }
    if (res.status === 404) {
      setState({ state: "idle", message: manual ? "No update has been published yet." : void 0 });
      return current;
    }
    if (!res.ok) {
      setState(manual ? { state: "error", message: "The server could not check for updates." } : { state: "idle" });
      return current;
    }
    const info = await res.json().catch(() => ({}));
    const version = String(info.version ?? "");
    const sha256 = String(info.sha256 ?? "").toLowerCase();
    const notes = typeof info.notes === "string" ? info.notes : "";
    if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version) || !/^[0-9a-f]{64}$/.test(sha256)) {
      setState({ state: "error", message: "The server sent an unexpected reply." });
      return current;
    }
    if (!newer(version, app.getVersion())) {
      setState({ state: "idle", message: manual ? "You have the latest version." : void 0 });
      return current;
    }
    fs.mkdirSync(updatesDir(), { recursive: true });
    const name = platform === "windows" ? `Office-Hub-Setup-${version}.exe` : `Office-Hub-${version}.AppImage`;
    const finalPath = path.join(updatesDir(), name);
    for (const f of fs.readdirSync(updatesDir())) {
      if (f !== name) fs.rmSync(path.join(updatesDir(), f), { force: true });
    }
    if (fs.existsSync(finalPath) && await sha256File(finalPath) === sha256) {
      readyFile = finalPath;
      setState({ state: "ready", version, notes });
      return current;
    }
    fs.rmSync(finalPath, { force: true });
    setState({ state: "downloading", version, percent: 0 });
    const dl = await net.fetch(`${base}/api/app-update/download?platform=${platform}`).catch(() => null);
    if (!dl || !dl.ok || !dl.body) {
      setState({ state: "error", message: "The update could not be downloaded." });
      return current;
    }
    if ((dl.headers.get("x-installer-sha256") ?? "").toLowerCase() !== sha256) {
      setState({ state: "error", message: "The update changed while downloading. It will be tried again later." });
      return current;
    }
    const total = Number(dl.headers.get("content-length") ?? 0);
    const partPath = finalPath + ".part";
    const hash = createHash("sha256");
    let received = 0;
    let lastSent = 0;
    const meter = new Transform({
      transform(chunk, _enc, cb) {
        hash.update(chunk);
        received += chunk.length;
        const now = Date.now();
        if (now - lastSent > 250 && total > 0) {
          lastSent = now;
          setState({ state: "downloading", version, percent: Math.floor(received / total * 100) });
        }
        cb(null, chunk);
      }
    });
    try {
      await pipeline(Readable.fromWeb(dl.body), meter, fs.createWriteStream(partPath));
    } catch {
      fs.rmSync(partPath, { force: true });
      setState({ state: "error", message: "The update download was interrupted. It will be tried again later." });
      return current;
    }
    if (hash.digest("hex") !== sha256) {
      fs.rmSync(partPath, { force: true });
      setState({ state: "error", message: "The update failed its safety check, so it was deleted. Tell your master." });
      return current;
    }
    fs.renameSync(partPath, finalPath);
    readyFile = finalPath;
    setState({ state: "ready", version, notes });
    return current;
  } catch (err) {
    console.error("Update check failed:", err);
    setState(manual ? { state: "error", message: "The update check failed." } : { state: "idle" });
    return current;
  } finally {
    busy = false;
  }
}
function registerUpdater() {
  ipcMain.handle("get-app-version", () => app.getVersion());
  ipcMain.handle("get-update-state", () => current);
  ipcMain.handle("check-for-updates", () => check(true));
  ipcMain.handle("apply-update", () => {
    if (current.state !== "ready" || !readyFile || !fs.existsSync(readyFile)) {
      return Promise.resolve({ ok: false, error: "No update is ready." });
    }
    const file = readyFile;
    if (process.platform !== "win32") {
      shell.showItemInFolder(file);
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => {
      const child = spawn(file, ["/S", "--updated", "--force-run"], {
        detached: true,
        stdio: "ignore",
        shell: false
      });
      child.once("error", () => resolve({ ok: false, error: "Could not start the update." }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
        setTimeout(() => app.quit(), 300);
      });
    });
  });
  if (app.isPackaged) {
    setTimeout(() => check(false), 15e3);
    setInterval(() => check(false), 4 * 60 * 60 * 1e3);
  }
}
const myPlatform = process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : null;
const WIN_VARS = /* @__PURE__ */ new Set([
  "LOCALAPPDATA",
  "APPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMDATA",
  "USERPROFILE",
  "SYSTEMDRIVE"
]);
function expand(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 260) return null;
  if (/[\u0000-\u001f<>"|?*]/.test(raw)) return null;
  if (raw.split(/[\\/]+/).includes("..")) return null;
  let out = raw;
  if (process.platform === "win32") {
    let bad = false;
    out = raw.replace(/%([^%]+)%/g, (_m, name) => {
      const value = WIN_VARS.has(name.toUpperCase()) ? process.env[name] : void 0;
      if (!value) {
        bad = true;
        return "";
      }
      return value;
    });
    if (bad || out.includes("%")) return null;
  } else if (raw.startsWith("~/")) {
    out = path.join(os.homedir(), raw.slice(2));
  }
  out = path.normalize(out);
  return path.isAbsolute(out) ? out : null;
}
function usable(file) {
  try {
    if (process.platform === "win32" && !file.toLowerCase().endsWith(".exe")) return false;
    if (!fs.statSync(file).isFile()) return false;
    if (process.platform !== "win32") fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function firstFound(paths) {
  for (const raw of paths.slice(0, 5)) {
    const file = expand(raw);
    if (file && usable(file)) return file;
  }
  return null;
}
async function fetchHints(token) {
  const res = await net.fetch(`${currentServerUrl()}/api/locations`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res) return { error: "Could not reach the server." };
  if (res.status === 401) return { unauthorized: true };
  if (!res.ok) return { error: "The server refused the request." };
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return { error: "The server sent an unexpected reply." };
  const hints = data.filter(
    (h) => !!h && typeof h.systemId === "string" && h.platform === myPlatform && Array.isArray(h.paths) && h.paths.every((p) => typeof p === "string")
  );
  return { hints };
}
const validToken = (t) => typeof t === "string" && t.length > 0 && t.length <= 200;
const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 100;
function registerLocations() {
  ipcMain.handle("detect-programs", async (_event, token) => {
    if (!validToken(token) || !myPlatform) return { ok: false, found: {} };
    const r = await fetchHints(token);
    if (!r.hints) return { ok: false, unauthorized: r.unauthorized, error: r.error, found: {} };
    const targets = readTargets();
    const found = {};
    for (const h of r.hints) {
      if (targets[h.systemId]) continue;
      const file = firstFound(h.paths);
      if (file) found[h.systemId] = file;
    }
    return { ok: true, found };
  });
  ipcMain.handle(
    "use-detected-program",
    async (_event, systemId, token) => {
      if (!validId(systemId) || !validToken(token)) return { ok: false, error: "Invalid request" };
      const r = await fetchHints(token);
      if (!r.hints) {
        return { ok: false, unauthorized: r.unauthorized, error: r.error ?? "Could not check." };
      }
      const hint = r.hints.find((h) => h.systemId === systemId);
      const file = hint ? firstFound(hint.paths) : null;
      if (!file) return { ok: false, error: "The program was not found on this computer." };
      const targets = readTargets();
      targets[systemId] = { type: "exe", path: file };
      writeTargets(targets);
      return { ok: true };
    }
  );
}
const deviceFile = () => path.join(app.getPath("userData"), "device.json");
function deviceId() {
  try {
    const saved = JSON.parse(fs.readFileSync(deviceFile(), "utf-8"));
    if (typeof saved.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(saved.deviceId)) {
      return saved.deviceId;
    }
  } catch {
  }
  const id = randomUUID();
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(deviceFile(), JSON.stringify({ deviceId: id }) + "\n");
  return id;
}
function registerDevice() {
  ipcMain.handle("get-device-info", () => ({
    deviceId: deviceId(),
    hostname: os.hostname().slice(0, 64),
    platform: process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : "other"
  }));
  ipcMain.handle("check-targets", () => {
    const out = {};
    for (const [id, t] of Object.entries(readTargets())) {
      if (t.type === "url") out[id] = typeof t.url === "string" && t.url ? "ready" : "broken";
      else if (t.type === "exe") out[id] = typeof t.path === "string" && fs.existsSync(t.path) ? "ready" : "broken";
    }
    return out;
  });
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    title: "Office Hub",
    icon: path.join(process.env.VITE_PUBLIC, "../src/assets/icon.png"),
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  if (app.isPackaged) Menu.setApplicationMenu(null);
  registerTrust();
  registerLauncher();
  registerSettings();
  registerInstaller();
  registerUpdater();
  registerLocations();
  registerDevice();
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
