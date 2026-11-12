import { useEffect, useState } from "react";

export type LocationInfo = { systemId: string; platform: string; paths: string[] };

type Props = {
  systemId: string;
  locations: LocationInfo[];
  serverUrl: string;
  token: string;
  onChanged: () => void;
  onExpired: () => void;
};

export default function LocationEditor({ systemId, locations, serverUrl, token, onChanged, onExpired }: Props) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("windows");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const current = locations.find((l) => l.systemId === systemId && l.platform === platform);
  const saved = current ? current.paths.join("\n") : "";

  useEffect(() => {
    setText(saved);
  }, [platform, open, saved]);

  async function save() {
    setError("");
    setMsg("");
    const paths = text
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    try {
      const res =
        paths.length === 0
          ? await fetch(`${serverUrl}/api/systems/${encodeURIComponent(systemId)}/location?platform=${platform}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            })
          : await fetch(`${serverUrl}/api/systems/${encodeURIComponent(systemId)}/location`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ platform, paths }),
            });
      if (res.status === 401) {
        onExpired();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !(paths.length === 0 && res.status === 404)) {
        setError(data.error ?? "Could not save.");
        return;
      }
      setMsg("Saved.");
      onChanged();
    } catch {
      setError("Server unreachable.");
    }
  }

  const count = locations.filter((l) => l.systemId === systemId).length;

  return (
    <div className="location">
      <div className="card-actions">
        <button className="link-btn" onClick={() => setOpen(!open)}>
          {open ? "Close install location" : `Install location${count ? ` (${count})` : ""}`}
        </button>
      </div>
      {open && (
        <div>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
          <textarea
            rows={3}
            placeholder={
              platform === "windows"
                ? "One path per line, for example:\n%LOCALAPPDATA%\\Programs\\MyApp\\MyApp.exe\n%ProgramFiles%\\MyApp\\MyApp.exe"
                : "One path per line, for example:\n/usr/bin/myapp\n~/Applications/myapp"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="target">
            {platform === "windows"
              ? "Up to 5 paths, checked in order. Allowed variables: %LOCALAPPDATA%, %APPDATA%, %ProgramFiles%, %ProgramFiles(x86)%, %ProgramData%, %USERPROFILE%, %SystemDrive%. Leave empty and save to remove."
              : "Up to 5 paths, checked in order. Start with / or ~/. Leave empty and save to remove."}
          </p>
          {error && <span className="error">{error}</span>}
          {msg && <span className="status">{msg}</span>}
          <div className="card-actions">
            <button className="add-btn" onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}