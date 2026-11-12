import { useEffect, useRef, useState } from "react";

export type InstallerInfo = {
  systemId: string;
  platform: string;
  filename: string;
  size: number;
  sha256: string;
  uploadedAt: string;
};

type Props = {
  systemId: string;
  installers: InstallerInfo[];
  isMaster: boolean;
  hasTarget: boolean;
  serverUrl: string;
  token: string;
  onChanged: () => void;
  onExpired: () => void;
  onInstallerStarted?: () => void;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function InstallerControls({
  systemId,
  installers,
  isMaster,
  hasTarget,
  serverUrl,
  token,
  onChanged,
  onExpired,
  onInstallerStarted,
}: Props) {
  const myPlatform = window.officeHub.platform;
  const mine = installers.find((i) => i.platform === myPlatform);
  const hasInstallerData = isMaster || installers.length > 0;

  const [phase, setPhase] = useState<"idle" | "downloading" | "ready">("idle");
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState("");

  const [uploadPlatform, setUploadPlatform] = useState(myPlatform === "linux" ? "linux" : "windows");
  const [uploading, setUploading] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return window.officeHub.onDownloadProgress((p) => {
      if (p.systemId === systemId && p.total > 0) {
        setProgress(Math.round((p.received / p.total) * 100));
      }
    });
  }, [systemId]);

  async function download() {
    setMsg("");
    setProgress(0);
    setPhase("downloading");
    const result = await window.officeHub.downloadInstaller(systemId, myPlatform, token);
    if (result.unauthorized) {
      onExpired();
      return;
    }
    if (result.ok) {
      setPhase("ready");
      setMsg("Downloaded and checked. Nothing has been installed yet.");
    } else {
      setPhase("idle");
      setMsg(result.error ?? "Download failed.");
    }
  }

  async function run() {
    const result = await window.officeHub.runInstaller(systemId);
    if (!result.ok) {
      setMsg(result.error ?? "Could not start the installer.");
      return;
    }
      onInstallerStarted?.(); 
      setMsg(
      myPlatform === "windows"
        ? "The installer was started. When it finishes, this card will offer to use the installed program.."
        : "The folder was opened. Run the installer from there, then click Choose program."
    );
  }

  async function show() {
    await window.officeHub.showInstaller(systemId);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  }

  function upload(file: File) {
    setMsg("");
    setUploading(0);
    const xhr = new XMLHttpRequest();
    xhr.open(
      "PUT",
      `${serverUrl}/api/systems/${encodeURIComponent(systemId)}/installer?platform=${uploadPlatform}&filename=${encodeURIComponent(file.name)}`
    );
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploading(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(null);
      if (xhr.status === 401) {
        onExpired();
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        setMsg("Uploaded.");
        onChanged();
        return;
      }
      let error = "Upload failed.";
      try {
        error = JSON.parse(xhr.responseText).error ?? error;
      } catch {
        // keep the generic message
      }
      setMsg(error);
    };
    xhr.onerror = () => {
      setUploading(null);
      setMsg("Server unreachable.");
    };
    xhr.send(file);
  }

  async function remove(platform: string) {
    if (confirmRemove !== platform) {
      setConfirmRemove(platform);
      return;
    }
    setConfirmRemove(null);
    try {
      const res = await fetch(
        `${serverUrl}/api/systems/${encodeURIComponent(systemId)}/installer?platform=${platform}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) {
        onExpired();
        return;
      }
      setMsg(res.ok ? "Installer removed." : "Could not remove it.");
      if (res.ok) onChanged();
    } catch {
      setMsg("Server unreachable.");
    }
  }

  return (
    <div className="installer">
      {hasInstallerData && (
        <details className="installer-panel">
          <summary>
            <span>Installer</span>
            <span className="installer-summary">
              {installers.length === 0 ? "No installer available" : `${installers.length} platform${installers.length === 1 ? "" : "s"} available`}
            </span>
          </summary>
          <div className="installer-body">
            {!hasTarget && mine && (
              <div className="installer-download">
                <div className="installer-file">
                  <strong>{mine.filename}</strong>
                  <span>{mine.platform} · {mb(mine.size)} · Available</span>
                </div>
                <p className="target">Not set up on this computer yet.</p>
          <div className="card-actions">
            {phase !== "ready" && (
              <button className="add-btn" disabled={phase === "downloading"} onClick={download}>
                {phase === "downloading" ? `Downloading ${progress}%` : "Download installer"}
              </button>
            )}
            {phase === "ready" && (
              <>
                <button className="add-btn" onClick={run}>
                  Run installer
                </button>
                <button className="link-btn" onClick={show}>
                  Show file
                </button>
              </>
            )}
          </div>
          {phase === "downloading" && (
            <div className="progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          )}
              </div>
            )}

            {isMaster && (
              <div className="installer-management">
                <div className="installer-list">
                  {installers.length === 0 ? <span className="target-empty">No installers uploaded.</span> : installers.map((i) => (
                    <div className="installer-row" key={i.platform}>
                      <span><strong>{i.filename}</strong><small>{i.platform} · {mb(i.size)} · Available</small></span>
                      <button className="text-action danger" onClick={() => remove(i.platform)}>
                        {confirmRemove === i.platform ? "Confirm remove" : "Remove"}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="installer-upload">
                  <select value={uploadPlatform} onChange={(e) => setUploadPlatform(e.target.value)}>
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                  </select>
                  <button className="link-btn" disabled={uploading !== null} onClick={() => fileRef.current?.click()}>
                    {uploading !== null ? `Uploading ${uploading}%` : installers.length ? "Replace installer" : "Upload installer"}
                  </button>
                  <input ref={fileRef} type="file" hidden onChange={pickFile} />
                </div>
                {uploading !== null && <div className="progress"><div style={{ width: `${uploading}%` }} /></div>}
              </div>
            )}
          </div>
        </details>
      )}

      {msg && <p className="target">{msg}</p>}
    </div>
  );
}