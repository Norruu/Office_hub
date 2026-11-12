import { useEffect, useState } from "react";

type Entry = {
  id: string;
  action: string;
  systemId: string | null;
  details: string | null;
  createdAt: string;
  actor: string | null;
};

type Props = {
  serverUrl: string;
  token: string;
  onExpired: () => void;
  onClose: () => void;
};

export default function AuditPanel({ serverUrl, token, onExpired, onClose }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${serverUrl}/api/audit`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.status === 401) {
          onExpired();
          return;
        }
        if (!res.ok) throw new Error();
        setEntries(await res.json());
      })
      .catch(() => setError("Could not load the activity log."));
  }, []);

  return (
    <div className="form">
      <strong>Activity log (latest 100)</strong>
      {error && <span className="error">{error}</span>}
      {entries.map((e) => (
        <div className="audit-row" key={e.id}>
          <span>{e.createdAt} (UTC)</span>
          <span>{e.actor ?? "unknown"}</span>
          <span>{e.action}</span>
          <span>{e.details ?? ""}</span>
        </div>
      ))}
      <div className="form-actions">
        <button className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}