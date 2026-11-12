import { useEffect, useState } from "react";

type Check = {
  id: string;
  label: string;
  level: "ok" | "warning" | "critical" | "info";
  detail: string;
};
type Report = { status: string; checks: Check[] };

type Props = {
  serverUrl: string;
  token: string;
  onExpired: () => void;
  onClose: () => void;
  onStatus?: (status: string) => void;
};

const rank = { critical: 0, warning: 1, ok: 2, info: 3 };
const names = { critical: "Problem", warning: "Warning", ok: "OK", info: "Info" };

export default function HealthPanel({ serverUrl, token, onExpired, onClose, onStatus }: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${serverUrl}/api/admin/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401) {
        onExpired();
        return;
      }
      if (!res.ok) {
        setError("Could not read the server's health.");
        return;
      }
      const data: Report = await res.json();
      setReport(data);
      onStatus?.(data.status);
    } catch {
      setError("Server unreachable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary =
    report?.status === "critical"
      ? "Something needs attention now."
      : report?.status === "warning"
        ? "Something needs attention soon."
        : "Everything looks fine.";

  const sorted = report ? [...report.checks].sort((a, b) => rank[a.level] - rank[b.level]) : [];

  return (
    <div className="form">
      <div className="hub-header">
        <strong>Server health</strong>
        <div>
          <button className="link-btn" disabled={loading} onClick={load}>
            {loading ? "Checking..." : "Refresh"}
          </button>{" "}
          <button className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {error && <span className="error">{error}</span>}
      {report && <span className={`health-${report.status}`}>{summary}</span>}
      {sorted.map((c) => (
        <div className="health-row" key={c.id}>
          <span className={`health-${c.level}`}>{names[c.level]}</span>
          <span>{c.label}</span>
          <span className="target">{c.detail}</span>
        </div>
      ))}
    </div>
  );
}