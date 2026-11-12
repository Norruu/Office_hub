import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";



export type Target =
  | { type: "exe"; path: string; args?: string[] }
  | { type: "url"; url: string };

type Result = { ok: boolean; error?: string; cancelled?: boolean };

const targetsFile = () => path.join(app.getPath("userData"), "launch-targets.json");

export function readTargets(): Record<string, Target> {
  try {
    return JSON.parse(fs.readFileSync(targetsFile(), "utf-8"));
  } catch {
    return {};
  }
}

export function writeTargets(targets: Record<string, Target>) {
  fs.writeFileSync(targetsFile(), JSON.stringify(targets, null, 2) + "\n");
}

function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 100;
}

function parseWebUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function registerLauncher() {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  if (!fs.existsSync(targetsFile())) fs.writeFileSync(targetsFile(), "{}\n");
  console.log("Launch targets file:", targetsFile());

  // What this computer is set up to open (shown on the cards)
  ipcMain.handle("get-launch-targets", () => {
    const out: Record<string, { type: string; value: string }> = {};
    for (const [id, t] of Object.entries(readTargets())) {
      if (t.type === "exe") {
        out[id] = { type: "exe", value: typeof t.path === "string" ? t.path : "" };
      } else if (t.type === "url") {
        out[id] = { type: "url", value: typeof t.url === "string" ? t.url : "" };
      }
    }
    return out;
  });

  // Open a native file dialog, then save the chosen program
  ipcMain.handle("choose-program", async (event, systemId: unknown): Promise<Result> => {
    if (!validId(systemId)) return { ok: false, error: "Invalid request" };

    const options: OpenDialogOptions = {
      title: "Choose the program to launch",
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [
              { name: "Programs and shortcuts", extensions: ["exe", "lnk"] },
              { name: "All files", extensions: ["*"] },
            ]
          : undefined,
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, cancelled: true };
    }

    let chosen = picked.filePaths[0];

    // A Windows shortcut (.lnk) can't be started directly, so use the program it points to
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

  // Save a web link as the target
  ipcMain.handle("set-url-target", (_event, systemId: unknown, value: unknown): Result => {
    if (!validId(systemId)) return { ok: false, error: "Invalid request" };
    const url = parseWebUrl(value);
    if (!url) return { ok: false, error: "Enter a full link starting with http:// or https://" };

    const targets = readTargets();
    targets[systemId] = { type: "url", url: url.toString() };
    writeTargets(targets);
    return { ok: true };
  });

  // Remove this computer's target for a system
  ipcMain.handle("clear-launch-target", (_event, systemId: unknown): Result => {
    if (!validId(systemId)) return { ok: false, error: "Invalid request" };
    const targets = readTargets();
    delete targets[systemId];
    writeTargets(targets);
    return { ok: true };
  });

  // Launch (unchanged logic)
  ipcMain.handle("launch-system", async (_event, systemId: unknown): Promise<Result> => {
    if (!validId(systemId)) return { ok: false, error: "Invalid request" };

    const target = readTargets()[systemId];
    if (!target) return { ok: false, error: "No launch target on this computer" };

    if (target.type === "url") {
      const url = parseWebUrl(target.url);
      if (!url) return { ok: false, error: "Invalid link" };
      await shell.openExternal(url.toString());
      return { ok: true };
    }

    if (target.type === "exe") {
      if (
        typeof target.path !== "string" ||
        !path.isAbsolute(target.path) ||
        !fs.existsSync(target.path)
      ) {
        return { ok: false, error: "Program not found" };
      }
      const args = target.args ?? [];
      if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) {
        return { ok: false, error: "Invalid arguments" };
      }
      return new Promise<Result>((resolve) => {
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