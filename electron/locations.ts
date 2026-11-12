import { ipcMain, net } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { currentServerUrl } from "./settings";
import { readTargets, writeTargets } from "./launcher";

type Hint = { systemId: string; platform: string; paths: string[] };
type DetectResult = { ok: boolean; unauthorized?: boolean; error?: string; found: Record<string, string> };

const myPlatform =
  process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : null;

const WIN_VARS = new Set([
  "LOCALAPPDATA",
  "APPDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMDATA",
  "USERPROFILE",
  "SYSTEMDRIVE",
]);

// Turn a hint like %LOCALAPPDATA%\App\App.exe into a real path, or null if it isn't acceptable
function expand(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 260) return null;
  if (/[\u0000-\u001f<>"|?*]/.test(raw)) return null;
  if (raw.split(/[\\/]+/).includes("..")) return null;

  let out = raw;
  if (process.platform === "win32") {
    let bad = false;
    out = raw.replace(/%([^%]+)%/g, (_m, name: string) => {
      const value = WIN_VARS.has(name.toUpperCase()) ? process.env[name] : undefined;
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

function usable(file: string): boolean {
  try {
    if (process.platform === "win32" && !file.toLowerCase().endsWith(".exe")) return false;
    if (!fs.statSync(file).isFile()) return false;
    if (process.platform !== "win32") fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function firstFound(paths: string[]): string | null {
  for (const raw of paths.slice(0, 5)) {
    const file = expand(raw);
    if (file && usable(file)) return file;
  }
  return null;
}

async function fetchHints(
  token: string
): Promise<{ hints?: Hint[]; unauthorized?: boolean; error?: string }> {
  const res = await net
    .fetch(`${currentServerUrl()}/api/locations`, { headers: { Authorization: `Bearer ${token}` } })
    .catch(() => null);
  if (!res) return { error: "Could not reach the server." };
  if (res.status === 401) return { unauthorized: true };
  if (!res.ok) return { error: "The server refused the request." };

  const data = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(data)) return { error: "The server sent an unexpected reply." };
  const hints = data.filter(
    (h): h is Hint =>
      !!h &&
      typeof h.systemId === "string" &&
      h.platform === myPlatform &&
      Array.isArray(h.paths) &&
      h.paths.every((p: unknown) => typeof p === "string")
  );
  return { hints };
}

const validToken = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length <= 200;
const validId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && id.length <= 100;

export function registerLocations() {
  // Which programs are already on this computer? (display only, nothing is saved)
  ipcMain.handle("detect-programs", async (_event, token: unknown): Promise<DetectResult> => {
    if (!validToken(token) || !myPlatform) return { ok: false, found: {} };
    const r = await fetchHints(token);
    if (!r.hints) return { ok: false, unauthorized: r.unauthorized, error: r.error, found: {} };

    const targets = readTargets();
    const found: Record<string, string> = {};
    for (const h of r.hints) {
      if (targets[h.systemId]) continue; // already set up on this computer
      const file = firstFound(h.paths);
      if (file) found[h.systemId] = file;
    }
    return { ok: true, found };
  });

  // The person clicked "Use it": look again, and save what is found as the launch target
  ipcMain.handle(
    "use-detected-program",
    async (_event, systemId: unknown, token: unknown) => {
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