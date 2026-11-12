import { app, session } from "electron";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { currentServerUrl } from "./settings";

function loadCa(): X509Certificate | null {
  const candidates = [
    path.join(process.resourcesPath, "office-ca.pem"), // installed app
    path.join(app.getAppPath(), "build-resources", "office-ca.pem"), // development
  ];
  for (const file of candidates) {
    try {
      const ca = new X509Certificate(fs.readFileSync(file));
      if (ca.ca) return ca;
    } catch {
      // try the next location
    }
  }
  return null;
}

// Trust the office server's certificate if (and only if) our own CA signed it
export function registerTrust() {
  const ca = loadCa();
  if (!ca) console.warn("office-ca.pem not found: HTTPS to the office server will not be trusted.");

  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // -3 means "use the normal Chromium decision"
    if (!ca) return callback(-3);

    let serverHost: string;
    try {
      serverHost = new URL(currentServerUrl()).hostname;
    } catch {
      return callback(-3);
    }
    if (request.hostname !== serverHost) return callback(-3);

    try {
      const leaf = new X509Certificate(request.certificate.data);
      const now = Date.now();
      const timeOk =
        now >= Date.parse(leaf.validFrom) &&
        now <= Date.parse(leaf.validTo) &&
        now <= Date.parse(ca.validTo);
      const signedByOurCa = leaf.verify(ca.publicKey);
      const nameOk = isIP(serverHost) ? !!leaf.checkIP(serverHost) : !!leaf.checkHost(serverHost);
      callback(timeOk && signedByOurCa && nameOk ? 0 : -3);
    } catch {
      callback(-3);
    }
  });
}