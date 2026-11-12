import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_URL = "http://localhost:3000";

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function readJson(file: string): { serverUrl?: unknown } {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

// Accept only http(s) addresses, and keep just the address part (no path or trailing slash)
function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function currentServerUrl(): string {
  // 1. The address saved on this computer
  const saved = cleanUrl(readJson(settingsFile()).serverUrl);
  if (saved) return saved;
  // 2. The address baked into the installer
  const bundled = cleanUrl(
    readJson(path.join(process.resourcesPath, "default-settings.json")).serverUrl
  );
  return bundled ?? DEFAULT_URL;
}

export function registerSettings() {
  ipcMain.handle("get-server-url", () => currentServerUrl());

  ipcMain.handle("set-server-url", (_event, value: unknown) => {
    const url = cleanUrl(value);
    if (!url) {
      return { ok: false, error: "Enter a full address, like http://192.168.1.20:3000" };
    }
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify({ serverUrl: url }, null, 2) + "\n");
    return { ok: true, url };
  });
}