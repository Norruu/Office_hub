import { app, ipcMain, net, shell } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { currentServerUrl } from "./settings";

type Result = { ok: boolean; error?: string; unauthorized?: boolean };

const ALLOWED_EXT = [".exe", ".msi", ".appimage", ".deb", ".rpm", ".tar.gz"];

// Verified downloads from this session. The screen can only run files listed here.
const verified = new Map<string, string>();

const installerFolder = () => path.join(app.getPath("downloads"), "Office Hub");

function safeName(raw: string): string | null {
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

export function registerInstaller() {
  ipcMain.handle(
    "download-installer",
    async (event, systemId: unknown, platform: unknown, token: unknown): Promise<Result> => {
      if (typeof systemId !== "string" || systemId.length === 0 || systemId.length > 100) {
        return { ok: false, error: "Invalid request" };
      }
      if (platform !== "windows" && platform !== "linux") {
        return { ok: false, error: "Invalid request" };
      }
      if (typeof token !== "string" || token.length === 0 || token.length > 200) {
        return { ok: false, error: "Invalid request" };
      }

      const url = `${currentServerUrl()}/api/systems/${encodeURIComponent(systemId)}/installer/download?platform=${platform}`;
      const res = await net.fetch(url, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!res) return { ok: false, error: "Could not reach the server." };

      if (res.status === 401) {
        return { ok: false, unauthorized: true, error: "Your session expired. Please log in again." };
      }
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
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
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk);
          received += chunk.length;
          const now = Date.now();
          if (now - lastSent > 100 && !event.sender.isDestroyed()) {
            lastSent = now;
            event.sender.send("download-progress", { systemId, received, total });
          }
          cb(null, chunk);
        },
      });

      try {
        await pipeline(
          Readable.fromWeb(res.body as unknown as WebReadableStream),
          meter,
          fs.createWriteStream(partPath)
        );
      } catch {
        fs.rmSync(partPath, { force: true });
        return { ok: false, error: "The download was interrupted. Please try again." };
      }

      // Compare the fingerprint of what arrived with the one recorded at upload
      if (hash.digest("hex") !== expected) {
        fs.rmSync(partPath, { force: true });
        return {
          ok: false,
          error: "The file failed its safety check, so it was deleted. Please tell your master.",
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

  ipcMain.handle("run-installer", async (_event, systemId: unknown): Promise<Result> => {
    const file = typeof systemId === "string" ? verified.get(systemId) : undefined;
    if (!file || !fs.existsSync(file)) {
      return { ok: false, error: "Download the installer first." };
    }
    if (process.platform !== "win32") {
      shell.showItemInFolder(file); // on Linux, run it yourself from the folder
      return { ok: true };
    }
    const problem = await shell.openPath(file);
    return problem ? { ok: false, error: problem } : { ok: true };
  });

  ipcMain.handle("show-installer", (_event, systemId: unknown): Result => {
    const file = typeof systemId === "string" ? verified.get(systemId) : undefined;
    if (!file || !fs.existsSync(file)) return { ok: false, error: "No downloaded file found." };
    shell.showItemInFolder(file);
    return { ok: true };
  });
}