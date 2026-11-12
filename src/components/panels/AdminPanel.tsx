import { useEffect, useState } from "react";

type Job = { id: string; name: string; employeeCount: number; systemIds: string[] };
type Account = {
  id: string;
  username: string;
  role: string;
  jobId: string | null;
  active: number;
  pending: number;
};
type SystemRef = { id: string; name: string };

type Props = {
  serverUrl: string;
  token: string;
  role: string;
  systems: SystemRef[];
  onExpired: () => void;
  onClose: () => void;
};

const roleName = (r: string) => (r === "master" ? "Master" : r === "admin" ? "Supervisor" : "Employee");

export default function AdminPanel({ serverUrl, token, role, systems, onExpired, onClose }: Props) {
  const isMaster = role === "master";
  const [tab, setTab] = useState<"accounts" | "jobs">("accounts");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const [showNewUser, setShowNewUser] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newJob, setNewJob] = useState("");

  const [approveJobs, setApproveJobs] = useState<Record<string, string>>({});
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");

  const [newJobName, setNewJobName] = useState("");
  const [editJobId, setEditJobId] = useState<string | null>(null);
  const [editSystemIds, setEditSystemIds] = useState<string[]>([]);

  const waiting = users.filter((u) => u.pending === 1);
  const accounts = users.filter((u) => u.pending !== 1);

  async function api(path: string, method = "GET", body?: unknown) {
    const res = await fetch(`${serverUrl}/api/admin${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      onExpired();
      throw new Error("expired");
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function load() {
    try {
      const [j, u] = await Promise.all([api("/jobs"), api("/users")]);
      if (!j.ok || !u.ok) throw new Error("load");
      setJobs(j.data);
      setUsers(u.data);
    } catch (e) {
      if ((e as Error).message !== "expired") setError("Could not load. Is the server running?");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(path: string, method: string, body: unknown, success: string) {
    setError("");
    setNotice("");
    try {
      const { ok, data } = await api(path, method, body);
      if (!ok) {
        setError(data.error ?? "That didn't work.");
        return false;
      }
      setNotice(success);
      await load();
      return true;
    } catch (e) {
      if ((e as Error).message !== "expired") setError("Server unreachable.");
      return false;
    }
  }

  async function createUser() {
    const ok = await run(
      "/users",
      "POST",
      { username: newName, password: newPass, role: isMaster ? newRole : "user", jobId: newJob || null },
      "Account created."
    );
    if (ok) {
      setShowNewUser(false);
      setNewName("");
      setNewPass("");
      setNewRole("user");
      setNewJob("");
    }
  }

  async function toggleActive(u: Account) {
    const key = `off:${u.id}`;
    if (u.active === 1 && confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    await run(`/users/${u.id}`, "PATCH", { active: u.active !== 1 }, u.active === 1 ? "Account disabled." : "Account enabled.");
  }

  async function resetPassword(u: Account) {
    const ok = await run(
      `/users/${u.id}/password`,
      "POST",
      { password: resetPass },
      "Password changed. Give it to the person privately."
    );
    if (ok) {
      setResetFor(null);
      setResetPass("");
    }
  }

  async function approve(u: Account) {
    await run(`/users/${u.id}/approve`, "POST", { jobId: approveJobs[u.id] || null }, `${u.username} approved.`);
  }

  async function reject(u: Account) {
    const key = `rej:${u.id}`;
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    await run(`/users/${u.id}/reject`, "POST", {}, `${u.username}'s request was rejected.`);
  }

  async function createJob() {
    const ok = await run("/jobs", "POST", { name: newJobName }, "Job created.");
    if (ok) setNewJobName("");
  }

  function startEditJob(j: Job) {
    setEditJobId(j.id);
    setEditSystemIds(j.systemIds);
  }

  function toggleSystem(id: string) {
    setEditSystemIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveJobSystems() {
    if (!editJobId) return;
    const ok = await run(`/jobs/${editJobId}/systems`, "PUT", { systemIds: editSystemIds }, "Apps saved.");
    if (ok) setEditJobId(null);
  }

  async function deleteJob(j: Job) {
    const key = `del:${j.id}`;
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    await run(`/jobs/${j.id}`, "DELETE", undefined, "Job deleted.");
  }

  const jobSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No job</option>
      {jobs.map((j) => (
        <option key={j.id} value={j.id}>
          {j.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="form">
      <div className="hub-header">
        <div className="tabs">
          <button className={`chip ${tab === "accounts" ? "active" : ""}`} onClick={() => setTab("accounts")}>
            {isMaster ? "Accounts" : "Employees"}
            {waiting.length > 0 ? ` (${waiting.length} waiting)` : ""}
          </button>
          <button className={`chip ${tab === "jobs" ? "active" : ""}`} onClick={() => setTab("jobs")}>
            Jobs and apps
          </button>
        </div>
        <button className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {error && <span className="error">{error}</span>}
      {notice && <span className="status">{notice}</span>}

      {tab === "accounts" && (
        <div>
          {waiting.length > 0 && (
            <div className="admin-job">
              <strong>Waiting for approval</strong>
              {waiting.map((u) => (
                <div className="admin-row" key={u.id}>
                  <div>{u.username}</div>
                  {jobSelect(approveJobs[u.id] ?? "", (v) => setApproveJobs({ ...approveJobs, [u.id]: v }))}
                  <div />
                  <div className="card-actions">
                    <button className="add-btn" onClick={() => approve(u)}>
                      Approve
                    </button>
                    <button className="link-btn danger" onClick={() => reject(u)}>
                      {confirmKey === `rej:${u.id}` ? "Click again to confirm" : "Reject"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="form-actions">
            <button className="add-btn" onClick={() => setShowNewUser(!showNewUser)}>
              {showNewUser ? "Cancel" : isMaster ? "+ New account" : "+ New employee"}
            </button>
          </div>

          {showNewUser && (
            <div className="form">
              <input placeholder="Username" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input
                type="password"
                placeholder="Starting password (10+ characters)"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
              {isMaster && (
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="user">Employee</option>
                  <option value="admin">Supervisor</option>
                  <option value="master">Master</option>
                </select>
              )}
              {jobSelect(newJob, setNewJob)}
              <div className="form-actions">
                <button className="add-btn" onClick={createUser}>
                  Create
                </button>
              </div>
            </div>
          )}

          {accounts.map((u) => (
            <div key={u.id}>
              <div className="admin-row">
                <div>
                  {u.username}
                  {u.active !== 1 && <span className="target"> (disabled)</span>}
                </div>
                {isMaster ? (
                  <select
                    value={u.role}
                    onChange={(e) => run(`/users/${u.id}`, "PATCH", { role: e.target.value }, "Role updated.")}
                  >
                    <option value="user">Employee</option>
                    <option value="admin">Supervisor</option>
                    <option value="master">Master</option>
                  </select>
                ) : (
                  <div>{roleName(u.role)}</div>
                )}
                {jobSelect(u.jobId ?? "", (v) => run(`/users/${u.id}`, "PATCH", { jobId: v || null }, "Job updated."))}
                <div className="card-actions">
                  <button className="link-btn" onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setResetPass(""); }}>
                    Reset password
                  </button>
                  <button className="link-btn danger" onClick={() => toggleActive(u)}>
                    {u.active === 1 ? (confirmKey === `off:${u.id}` ? "Click again to confirm" : "Disable") : "Enable"}
                  </button>
                </div>
              </div>
              {resetFor === u.id && (
                <div className="url-edit">
                  <input
                    type="password"
                    placeholder="New password (10+ characters)"
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                  />
                  <button className="add-btn" onClick={() => resetPassword(u)}>
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "jobs" && (
        <div>
          <div className="url-edit">
            <input placeholder="New job name (e.g. Accountant)" value={newJobName} onChange={(e) => setNewJobName(e.target.value)} />
            <button className="add-btn" onClick={createJob}>
              Add job
            </button>
          </div>

          {jobs.map((j) => (
            <div key={j.id} className="admin-job">
              <div className="hub-header">
                <div>
                  <strong>{j.name}</strong>
                  <span className="target">
                    {" "}
                    {j.employeeCount} account(s), {j.systemIds.length} app(s)
                  </span>
                </div>
                <div className="card-actions">
                  <button className="link-btn" onClick={() => (editJobId === j.id ? setEditJobId(null) : startEditJob(j))}>
                    {editJobId === j.id ? "Cancel" : "Choose apps"}
                  </button>
                  <button className="link-btn danger" onClick={() => deleteJob(j)}>
                    {confirmKey === `del:${j.id}` ? "Click again to confirm" : "Delete"}
                  </button>
                </div>
              </div>
              {editJobId === j.id && (
                <div className="check-list">
                  {systems.map((s) => (
                    <label key={s.id}>
                      <input type="checkbox" checked={editSystemIds.includes(s.id)} onChange={() => toggleSystem(s.id)} />
                      {s.name}
                    </label>
                  ))}
                  <div className="form-actions">
                    <button className="add-btn" onClick={saveJobSystems}>
                      Save apps
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {jobs.length === 0 && <span className="status">No jobs yet. Add one above.</span>}
        </div>
      )}
    </div>
  );
}