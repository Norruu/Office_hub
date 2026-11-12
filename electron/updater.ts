import { app, BrowserWindow, ipcMain, net, shell } from "electron";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { currentServerUrl } from "./settings";

export type UpdateState =
  | { state: "idle"; message?: string }
  | { state: "checking" }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string; notes: string }
  | { state: "error"; message: string };

const platform =
  process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : null;

let current: UpdateState = { state: "idle" };
let readyFile: string | null = null; // set only by a verified download, never by the screen
let busy = false;

const updatesDir = () => path.join(app.getPath("userData"), "updates");

function setState(next: UpdateState) {
  current = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("update-state", current);
  }
}

function newer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

async function check(manual: boolean): Promise<UpdateState> {
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
      setState({ state: "idle", message: manual ? "No update has been published yet." : undefined });
      return current;
    }
    if (!res.ok) {
      setState(manual ? { state: "error", message: "The server could not check for updates." } : { state: "idle" });
      return current;
    }

    const info = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const version = String(info.version ?? "");
    const sha256 = String(info.sha256 ?? "").toLowerCase();
    const notes = typeof info.notes === "string" ? info.notes : "";
    if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version) || !/^[0-9a-f]{64}$/.test(sha256)) {
      setState({ state: "error", message: "The server sent an unexpected reply." });
      return current;
    }

    if (!newer(version, app.getVersion())) {
      setState({ state: "idle", message: manual ? "You have the latest version." : undefined });
      return current;
    }

    // Keep only the file for this version
    fs.mkdirSync(updatesDir(), { recursive: true });
    const name = platform === "windows" ? `Office-Hub-Setup-${version}.exe` : `Office-Hub-${version}.AppImage`;
    const finalPath = path.join(updatesDir(), name);
    for (const f of fs.readdirSync(updatesDir())) {
      if (f !== name) fs.rmSync(path.join(updatesDir(), f), { force: true });
    }

    // Already downloaded earlier and still intact?
    if (fs.existsSync(finalPath) && (await sha256File(finalPath)) === sha256) {
      readyFile = finalPath;
      setState({ state: "ready", version, notes });
      return current;
    }
    fs.rmSync(finalPath, { force: true });

    // Download it
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
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        received += chunk.length;
        const now = Date.now();
        if (now - lastSent > 250 && total > 0) {
          lastSent = now;
          setState({ state: "downloading", version, percent: Math.floor((received / total) * 100) });
        }
        cb(null, chunk);
      },
    });

    try {
      await pipeline(Readable.fromWeb(dl.body as unknown as WebReadableStream), meter, fs.createWriteStream(partPath));
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

export function registerUpdater() {
  ipcMain.handle("get-app-version", () => app.getVersion());
  ipcMain.handle("get-update-state", () => current);
  ipcMain.handle("check-for-updates", () => check(true));

  ipcMain.handle("apply-update", (): Promise<{ ok: boolean; error?: string }> => {
    if (current.state !== "ready" || !readyFile || !fs.existsSync(readyFile)) {
      return Promise.resolve({ ok: false, error: "No update is ready." });
    }
    const file = readyFile;

    // Linux: show the file so it can be replaced by hand
    if (process.platform !== "win32") {
      shell.showItemInFolder(file);
      return Promise.resolve({ ok: true });
    }

    // Windows: run the verified installer silently, then close this app
    return new Promise((resolve) => {
      const child = spawn(file, ["/S", "--updated", "--force-run"], {
        detached: true,
        stdio: "ignore",
        shell: false,
      });
      child.once("error", () => resolve({ ok: false, error: "Could not start the update." }));
      child.once("spawn", () => {
        child.unref();
        resolve({ ok: true });
        setTimeout(() => app.quit(), 300);
      });
    });
  });

  // Look for updates shortly after start, then every 4 hours (installed copies only)
  if (app.isPackaged) {
    setTimeout(() => check(false), 15_000);
    setInterval(() => check(false), 4 * 60 * 60 * 1000);
  }
}