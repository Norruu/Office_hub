import { useEffect, useState } from "react";

type Computer = {
  deviceId: string;
  userId: string;
  username: string;
  role: string;
  jobName: string | null;
  hostname: string;
  platform: string;
  appVersion: string;
  lastSeenAt: string;
  assigned: string[];
  states: Record<string, string>;
};

type Fleet = {
  latest: Record<string, string>;
  systems: { id: string; name: string }[];
  computers: Computer[];
  neverSeen: { userId: string; username: string; jobName: string | null }[];
};

type Props = {
  serverUrl: string;
  token: string;
  onExpired: () => void;
  onClose: () => void;
};

const LABEL: Record<string, string> = {
  ready: "Ready",
  found: "Found, not registered",
  missing: "Not installed",
  broken: "Program file missing",
  unknown: "No report yet",
};

function isBehind(version: string, latest?: string): boolean {
  if (!latest) return false;
  const a = version.split(".").map(Number);
  const b = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

function daysSince(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 86_400_000;
}

function ago(iso: string): string {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function needsAttention(c: Computer, latest: Record<string, string>): boolean {
  if (isBehind(c.appVersion, latest[c.platform])) return true;
  if (daysSince(c.lastSeenAt) > 3) return true;
  return c.assigned.some((id) => (c.states[id] ?? "unknown") !== "ready");
}

export default function FleetPanel({ serverUrl, token, onExpired, onClose }: Props) {
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [error, setError] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const res = await fetch(`${serverUrl}/api/admin/fleet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onExpired();
        return;
      }
      if (!res.ok) {
        setError("Could not load the list.");
        return;
      }
      setFleet(await res.json());
    } catch {
      setError("Server unreachable.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function forget(c: Computer) {
    const key = `${c.deviceId}|${c.userId}`;
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    try {
      const res = await fetch(`${serverUrl}/api/admin/fleet/${c.deviceId}/${c.userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onExpired();
        return;
      }
      if (res.ok) load();
      else setError("Could not remove it.");
    } catch {
      setError("Server unreachable.");
    }
  }

  const names = new Map((fleet?.systems ?? []).map((s) => [s.id, s.name]));
  const all = fleet?.computers ?? [];
  const flagged = fleet ? all.filter((c) => needsAttention(c, fleet.latest)) : [];
  const shown = onlyProblems ? flagged : all;
  const latestText = fleet
    ? Object.entries(fleet.latest).map(([p, v]) => `${p} ${v}`).join(", ") || "none published"
    : "";

  return (
    <div className="form">
      <div className="hub-header">
        <strong>Who has what</strong>
        <div>
          <button className="link-btn" onClick={load}>
            Refresh
          </button>{" "}
          <button className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {error && <span className="error">{error}</span>}

      {fleet && (
        <>
          <span className="target">
            {all.length} computer(s), {flagged.length} need attention. Newest published version: {latestText}.
          </span>
          <label className="check-list">
            <span>
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only show
              computers that need attention
            </span>
          </label>

          {shown.map((c) => {
            const behind = isBehind(c.appVersion, fleet.latest[c.platform]);
            const quiet = daysSince(c.lastSeenAt) > 3;
            const key = `${c.deviceId}|${c.userId}`;
            return (
              <div className="fleet-row" key={key}>
                <div>
                  <strong>{c.hostname}</strong>
                  <div className="target">{c.platform}</div>
                </div>
                <div>
                  {c.username}
                  <div className="target">
                    {c.role === "master" ? "master" : c.role === "admin" ? "supervisor" : c.jobName ?? "no job"}
                  </div>
                </div>
                <div className={behind ? "fleet-missing" : ""}>
                  v{c.appVersion}
                  {behind && <div className="target">behind v{fleet.latest[c.platform]}</div>}
                </div>
                <div className={quiet ? "fleet-found" : ""}>{ago(c.lastSeenAt)}</div>
                <div>
                  {c.assigned.length === 0 && <span className="target">No apps assigned</span>}
                  {c.assigned.map((id) => {
                    const state = c.states[id] ?? "unknown";
                    return (
                      <div key={id} className={`fleet-${state}`}>
                        {names.get(id) ?? id}: {LABEL[state]}
                      </div>
                    );
                  })}
                </div>
                <button className="link-btn danger" onClick={() => forget(c)}>
                  {confirmKey === key ? "Click again" : "Forget"}
                </button>
              </div>
            );
          })}
          {shown.length === 0 && <span className="status">Nothing to show.</span>}

          {fleet.neverSeen.length > 0 && (
            <div className="admin-job">
              <strong>Accounts that have never connected</strong>
              <div className="target">
                {fleet.neverSeen.map((u) => `${u.username}${u.jobName ? ` (${u.jobName})` : ""}`).join(", ")}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}