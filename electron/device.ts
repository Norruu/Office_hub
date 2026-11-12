import { app, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTargets } from "./launcher";

const deviceFile = () => path.join(app.getPath("userData"), "device.json");

// A random ID, made once, so the server can tell this computer from another one
function deviceId(): string {
  try {
    const saved = JSON.parse(fs.readFileSync(deviceFile(), "utf-8")) as { deviceId?: unknown };
    if (typeof saved.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(saved.deviceId)) {
      return saved.deviceId;
    }
  } catch {
    // no file yet
  }
  const id = randomUUID();
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(deviceFile(), JSON.stringify({ deviceId: id }) + "\n");
  return id;
}

export function registerDevice() {
  ipcMain.handle("get-device-info", () => ({
    deviceId: deviceId(),
    hostname: os.hostname().slice(0, 64),
    platform:
      process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : "other",
  }));

  // Is each saved launch target still usable on this computer?
  ipcMain.handle("check-targets", () => {
    const out: Record<string, "ready" | "broken"> = {};
    for (const [id, t] of Object.entries(readTargets())) {
      if (t.type === "url") out[id] = typeof t.url === "string" && t.url ? "ready" : "broken";
      else if (t.type === "exe") out[id] = typeof t.path === "string" && fs.existsSync(t.path) ? "ready" : "broken";
    }
    return out;
  });
}