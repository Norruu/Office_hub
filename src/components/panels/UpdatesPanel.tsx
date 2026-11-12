import { useEffect, useRef, useState } from "react";

type Release = {
  platform: string;
  version: string;
  filename: string;
  size: number;
  sha256: string;
  notes: string;
  createdAt: string;
};

type Props = {
  serverUrl: string;
  token: string;
  onExpired: () => void;
  onClose: () => void;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function UpdatesPanel({ serverUrl, token, onExpired, onClose }: Props) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [platform, setPlatform] = useState("windows");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch(`${serverUrl}/api/app-updates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onExpired();
        return;
      }
      if (res.ok) setReleases(await res.json());
    } catch {
      setError("Server unreachable.");
    }
  }

  useEffect(() => {
    load();
    window.officeHub.getAppVersion().then(setAppVersion);
  }, []);

  function chooseFile() {
    setError("");
    setMsg("");
    if (!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) {
      setError("Enter the version first, like 1.0.1");
      return;
    }
    fileRef.current?.click();
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  }

  function upload(file: File) {
    setUploading(0);
    const xhr = new XMLHttpRequest();
    xhr.open(
      "PUT",
      `${serverUrl}/api/app-update?platform=${platform}&version=${encodeURIComponent(version)}` +
        `&filename=${encodeURIComponent(file.name)}&notes=${encodeURIComponent(notes)}`
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
        setMsg(`Published ${version}. Computers will pick it up within a few hours.`);
        setVersion("");
        setNotes("");
        load();
        return;
      }
      let text = "Upload failed.";
      try {
        text = JSON.parse(xhr.responseText).error ?? text;
      } catch {
        // keep the generic message
      }
      setError(text);
    };
    xhr.onerror = () => {
      setUploading(null);
      setError("Upload failed or the server is unreachable.");
    };
    xhr.send(file);
  }

  async function remove(p: string) {
    if (confirmRemove !== p) {
      setConfirmRemove(p);
      return;
    }
    setConfirmRemove(null);
    try {
      const res = await fetch(`${serverUrl}/api/app-update?platform=${p}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onExpired();
        return;
      }
      setMsg(res.ok ? "Release withdrawn." : "Could not withdraw it.");
      if (res.ok) load();
    } catch {
      setError("Server unreachable.");
    }
  }

  return (
    <div className="form">
      <div className="hub-header">
        <strong>App updates</strong>
        <button className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <span className="target">This computer runs version {appVersion}.</span>

      {error && <span className="error">{error}</span>}
      {msg && <span className="status">{msg}</span>}

      <div>
        <strong>Published</strong>
        {releases.length === 0 && <p className="status">Nothing published yet.</p>}
        {releases.map((r) => (
          <div className="admin-job" key={r.platform}>
            <div className="hub-header">
              <div>
                <strong>{r.platform}</strong> v{r.version}
                <span className="target">
                  {" "}
                  {r.filename} ({mb(r.size)}) {r.notes && `- ${r.notes}`}
                </span>
              </div>
              <button className="link-btn danger" onClick={() => remove(r.platform)}>
                {confirmRemove === r.platform ? "Click again to confirm" : "Withdraw"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="form">
        <strong>Publish a new version</strong>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="windows">Windows (.exe)</option>
          <option value="linux">Linux (.AppImage)</option>
        </select>
        <input placeholder="Version, like 1.0.1" value={version} onChange={(e) => setVersion(e.target.value)} />
        <input placeholder="What's new (optional, short)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="form-actions">
          <button className="add-btn" disabled={uploading !== null} onClick={chooseFile}>
            {uploading !== null ? `Uploading ${uploading}%` : "Choose installer file and publish"}
          </button>
          <input ref={fileRef} type="file" hidden onChange={pickFile} />
        </div>
        {uploading !== null && (
          <div className="progress">
            <div style={{ width: `${uploading}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}