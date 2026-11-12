import { useEffect, useRef, useState } from "react";
import "./library.css";
import iconUrl from "./assets/icon.png";
import { Icon, initials, tileStyle } from "./lib/ui";
import LoginScreen from "./components/LoginScreen";
import AuditPanel from "./components/panels/AuditPanel";
import AdminPanel from "./components/panels/AdminPanel";
import PasswordPanel from "./components/panels/PasswordPanel";
import UpdateBanner from "./components/UpdateBanner";
import UpdatesPanel from "./components/panels/UpdatesPanel";
import HealthPanel from "./components/panels/HealthPanel";
import FleetPanel from "./components/panels/FleetPanel";
import InstallerControls, {
  type InstallerInfo,
} from "./components/InstallerControls";
import LocationEditor, { type LocationInfo } from "./components/LocationEditor";
import { modules } from "./modules/registry";
import type { ModuleContext } from "./modules/types";
import { loadToken, saveToken } from "./lib/session";

type System = {
  id: string;
  name: string;
  description: string;
  categoryId: string | null;
  systemType: string;
  status: string;
};

type Category = { id: string; name: string };
type LaunchInfo = { type: string; value: string };
type Panel =
  | "admin"
  | "audit"
  | "health"
  | "fleet"
  | "updates"
  | "password"
  | null;

const PANEL_TITLES = {
  admin: "Employees and jobs",
  audit: "Activity log",
  health: "Server health",
  fleet: "Who has what",
  updates: "App updates",
  password: "Change password",
} as const;

function Hub({
  serverUrl,
  onServerUrlChanged,
}: {
  serverUrl: string;
  onServerUrlChanged: (url: string) => void;
}) {
  const SERVER_URL = serverUrl;

  const [status, setStatus] = useState("Checking server...");
  const [systems, setSystems] = useState<System[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [installers, setInstallers] = useState<InstallerInfo[]>([]);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [detected, setDetected] = useState<Record<string, string>>({});
  const [watching, setWatching] = useState(false);
  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [token, setToken] = useState<string | null>(loadToken());
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [healthStatus, setHealthStatus] = useState("unknown");
  const [confirmState, setConfirmState] = useState<{
    text: string;
    action: () => void;
  } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null);

  const [targets, setTargets] = useState<Record<string, LaunchInfo>>({});
  const [urlEditId, setUrlEditId] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [systemType, setSystemType] = useState("desktop");
  const [formStatus, setFormStatus] = useState("active");

  // Masters and supervisors manage systems, jobs and accounts
  const isMaster = role === "master";
  const canManage = role === "master" || role === "admin";
  const roleLabel =
    role === "master" ? "master" : role === "admin" ? "supervisor" : "employee";

  function authHeaders(): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function endSession(msg?: string) {
    saveToken(null);
    setToken(null);
    setUsername("");
    setRole("");
    setSystems([]);
    setCategories([]);
    setInstallers([]);
    setLocations([]);
    setDetected({});
    setWatching(false);
    setPanel(null);
    setHealthStatus("unknown");
    setShowForm(false);
    setActiveModule(null);
    setConfirmState(null);
    if (msg) setMessage(msg);
  }

  function go(next: Panel) {
    setPanel(panel === next ? null : next);
    setShowForm(false);
    setActiveModule(null);
  }

  function handleLoggedIn(
    newToken: string,
    loginName: string,
    newRole: string,
    remember: boolean,
  ) {
    saveToken(newToken, remember);
    setToken(newToken);
    setUsername(loginName);
    setRole(newRole);
    setMessage("");
  }

  async function handleLogout() {
    try {
      await fetch(`${SERVER_URL}/api/logout`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch {
      // the server is unreachable, so just forget the login on this computer
    }
    endSession("Logged out");
  }

  async function loadData() {
    try {
      const opts = () => ({
        headers: authHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      const [sysRes, catRes, insRes, locRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/systems`, opts()),
        fetch(`${SERVER_URL}/api/categories`, opts()),
        fetch(`${SERVER_URL}/api/installers`, opts()),
        fetch(`${SERVER_URL}/api/locations`, opts()),
      ]);
      if ([sysRes, catRes, insRes, locRes].some((r) => r.status === 401)) {
        endSession("Session expired. Please log in again.");
        return;
      }
      if (![sysRes, catRes, insRes, locRes].every((r) => r.ok)) {
        throw new Error("The server replied with an error");
      }
      setSystems(await sysRes.json());
      setCategories(await catRes.json());
      setInstallers(await insRes.json());
      setLocations(await locRes.json());
      setStatus("Server connected");
    } catch (err) {
      console.error("loadData failed:", err);
      setStatus("Server unreachable");
    }
  }

  async function refreshTargets() {
    setTargets(await window.officeHub.getLaunchTargets());
  }

  async function refreshDetected() {
    if (!token) return;
    const result = await window.officeHub.detectPrograms(token);
    if (result.unauthorized) {
      endSession("Session expired. Please log in again.");
      return;
    }
    if (result.ok) setDetected(result.found);
  }

  async function handleUseDetected(s: System) {
    const result = await window.officeHub.useDetectedProgram(s.id, token ?? "");
    if (result.unauthorized) {
      endSession("Session expired. Please log in again.");
      return;
    }
    setMessage(
      result.ok
        ? `${s.name} is set up on this computer.`
        : (result.error ?? "Could not set it up."),
    );
    await refreshTargets();
    await refreshDetected();
  }

  async function sendReport() {
    if (!token || status !== "Server connected") return;
    try {
      const info = await window.officeHub.getDeviceInfo();
      const saved = await window.officeHub.checkTargets();
      const appVersion = await window.officeHub.getAppVersion();
      const list = systems
        .filter((s) => s.status === "active")
        .map((s) => ({
          systemId: s.id,
          state: saved[s.id] ?? (detected[s.id] ? "found" : "missing"),
        }));
      await fetch(`${SERVER_URL}/api/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deviceId: info.deviceId,
          hostname: info.hostname,
          platform: info.platform,
          appVersion,
          systems: list,
        }),
      });
    } catch {
      // reporting is best-effort; it should never disturb the person
    }
  }
  const reportRef = useRef(sendReport);
  reportRef.current = sendReport;

  useEffect(() => {
    refreshTargets();
  }, []);

  useEffect(() => {
    if (!token) return;
    loadData();
    refreshDetected();
    fetch(`${SERVER_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) endSession();
        else if (res.ok) {
          const me = await res.json();
          setUsername(me.username);
          setRole(me.role);
        }
      })
      .catch(() => {});

    // Look again whenever the person comes back to this window
    const onFocus = () => refreshDetected();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [token]);

  // After an installer was started, look every 5 seconds for 20 minutes
  useEffect(() => {
    if (!watching || !token) return;
    const timer = setInterval(() => refreshDetected(), 5000);
    const stop = setTimeout(() => setWatching(false), 20 * 60 * 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [watching, token]);

  // Check the server's health quietly every 10 minutes (masters and supervisors)
  useEffect(() => {
    if (!token || !canManage) return;
    const check = () =>
      fetch(`${SERVER_URL}/api/admin/health`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          if (res.ok) setHealthStatus((await res.json()).status);
        })
        .catch(() => {});
    check();
    const timer = setInterval(check, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token, canManage]);

  // Tell the server how this computer looks, a few seconds after anything changes
  useEffect(() => {
    if (!token || status !== "Server connected") return;
    const timer = setTimeout(() => reportRef.current(), 3000);
    return () => clearTimeout(timer);
  }, [token, status, systems, targets, detected]);

  // ...and every 15 minutes while the app stays open
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => reportRef.current(), 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token]);

  async function handleLaunch(s: System) {
    const result = await window.officeHub.launch(s.id);
    setMessage(
      result.ok
        ? `Opening ${s.name}...`
        : `Could not open ${s.name}: ${result.error}`,
    );
  }

  async function handleChooseProgram(s: System) {
    const result = await window.officeHub.chooseProgram(s.id);
    if (result.cancelled) return;
    setMessage(
      result.ok
        ? `Saved launch program for ${s.name}`
        : `Could not save: ${result.error}`,
    );
    await refreshTargets();
  }

  async function handleSaveUrl(s: System) {
    const result = await window.officeHub.setUrlTarget(s.id, urlValue);
    if (!result.ok) {
      setMessage(`Could not save link: ${result.error}`);
      return;
    }
    setUrlEditId(null);
    setUrlValue("");
    setMessage(`Saved link for ${s.name}`);
    await refreshTargets();
  }

  async function handleClearTarget(s: System) {
    await window.officeHub.clearTarget(s.id);
    await refreshTargets();
  }

  async function handleCopyTarget(s: System) {
    const target = targets[s.id];
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.value);
      setMessage(
        `Copied the launch ${target.type === "url" ? "link" : "path"} for ${s.name}`,
      );
    } catch {
      setMessage("Could not copy the launch target.");
    }
  }

  function resetForm() {
    setName("");
    setDescription("");
    setCategoryId("");
    setSystemType("desktop");
    setFormStatus("active");
    setEditingId(null);
    setFormError("");
  }

  function toggleForm() {
    resetForm();
    setShowForm(!showForm);
  }

  function startEdit(s: System) {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    setCategoryId(s.categoryId ?? "");
    setSystemType(s.systemType);
    setFormStatus(s.status === "planned" ? "planned" : "active");
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit() {
    setFormError("");
    const url = editingId
      ? `${SERVER_URL}/api/systems/${editingId}`
      : `${SERVER_URL}/api/systems`;
    try {
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name,
          description,
          categoryId: categoryId || null,
          systemType,
          status: formStatus,
        }),
      });
      if (res.status === 401) {
        endSession("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        setFormError("Could not save. Check that the name is filled in.");
        return;
      }
      resetForm();
      setShowForm(false);
      await loadData();
    } catch {
      setFormError("Server unreachable.");
    }
  }

  async function handleArchive(s: System) {
    try {
      const res = await fetch(`${SERVER_URL}/api/systems/${s.id}/archive`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        endSession("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        setStatus("Could not archive");
        return;
      }
      await loadData();
    } catch {
      setStatus("Server unreachable");
    }
  }

  async function handleBackup() {
    try {
      const res = await fetch(`${SERVER_URL}/api/backup`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        endSession("Session expired. Please log in again.");
        return;
      }
      setMessage(res.ok ? "Backup created" : "Backup failed");
    } catch {
      setMessage("Server unreachable");
    }
  }

  const visible = systems.filter((s) => {
    const text = `${s.name} ${s.description}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const myModules = modules.filter((m) =>
    systems.some(
      (s) =>
        s.id === m.id && s.systemType === "module" && s.status === "active",
    ),
  );
  const openModule = myModules.find((m) => m.id === activeModule) ?? null;

  // Not logged in: show only the login screen
  if (!token) {
    return (
      <LoginScreen
        serverUrl={SERVER_URL}
        message={message}
        onLoggedIn={handleLoggedIn}
        onServerUrlChanged={onServerUrlChanged}
      />
    );
  }

  const onExpired = () => endSession("Session expired. Please log in again.");

  const ctx: ModuleContext = {
    serverUrl: SERVER_URL,
    token,
    username,
    role,
    onExpired,
  };
  const ModuleView = openModule?.component;

  return (
    <div className="app-shell">
      <div className="app-card">
        <aside className="sidebar">
          <div className="brand">
            <img src={iconUrl} alt="" />
            <span>Office Hub</span>
          </div>

          <nav>
            <button
              className={`nav-item ${panel === null && !openModule ? "active" : ""}`}
              onClick={() => {
                setPanel(null);
                setActiveModule(null);
              }}
            >
              <Icon name="apps" /> My apps
            </button>
            {myModules.length > 0 && (
              <>
                <p className="nav-section">Modules</p>
                {myModules.map((m) => (
                  <button
                    key={m.id}
                    className={`nav-item ${openModule?.id === m.id ? "active" : ""}`}
                    onClick={() => {
                      setPanel(null);
                      setShowForm(false);
                      setActiveModule(m.id);
                    }}
                  >
                    <Icon name="apps" /> {m.name}
                  </button>
                ))}
              </>
            )}

            {canManage && (
              <>
                <p className="nav-section">Manage</p>
                <button
                  className={`nav-item ${panel === "admin" ? "active" : ""}`}
                  onClick={() => go("admin")}
                >
                  <Icon name="people" /> Employees and jobs
                </button>
                <button
                  className={`nav-item ${panel === "audit" ? "active" : ""}`}
                  onClick={() => go("audit")}
                >
                  <Icon name="log" /> Activity log
                </button>
                <button
                  className={`nav-item ${panel === "health" ? "active" : ""}`}
                  onClick={() => go("health")}
                >
                  <Icon name="health" /> Server health
                  <span className={`nav-dot dot-${healthStatus}`} />
                </button>
                {isMaster && (
                  <>
                    <button
                      className={`nav-item ${panel === "fleet" ? "active" : ""}`}
                      onClick={() => go("fleet")}
                    >
                      <Icon name="fleet" /> Who has what
                    </button>
                    <button
                      className={`nav-item ${panel === "updates" ? "active" : ""}`}
                      onClick={() => go("updates")}
                    >
                      <Icon name="updates" /> App updates
                    </button>
                  </>
                )}
                <button className="nav-item" onClick={handleBackup}>
                  <Icon name="backup" /> Back up now
                </button>
              </>
            )}
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-user">
              <div className="avatar">
                {(username || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>{username}</strong>
                <span>{roleLabel}</span>
              </div>
            </div>
            <button
              className={`nav-item ${panel === "password" ? "active" : ""}`}
              onClick={() => go("password")}
            >
              <Icon name="lock" /> Change password
            </button>
            <button className="nav-item" onClick={handleLogout}>
              <Icon name="logout" /> Log out
            </button>
            <UpdateBanner />
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <h1 className="page-title">
                {panel ? PANEL_TITLES[panel] : openModule ? openModule.name : `Hello, ${username}`}
              </h1>
              {panel === null && (
                <p className="page-sub">
                  {visible.length} app{visible.length === 1 ? "" : "s"} -{" "}
                  {status}
                </p>
              )}
            </div>
            {panel === null && (
              <div className="topbar-actions">
                <input
                  className="search"
                  placeholder="Search apps..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {canManage && (
                  <button className="add-btn" onClick={toggleForm}>
                    {showForm ? "Close" : "+ Add system"}
                  </button>
                )}
              </div>
            )}
          </header>

          {message && <p className="notice">{message}</p>}

          {confirmState && (
            <div className="form">
              <strong>{confirmState.text}</strong>
              <div className="form-actions">
                <button
                  className="add-btn"
                  onClick={() => {
                    const run = confirmState.action;
                    setConfirmState(null);
                    run();
                  }}
                >
                  Yes
                </button>
                <button
                  className="link-btn"
                  onClick={() => setConfirmState(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {panel === "password" && (
            <PasswordPanel
              serverUrl={SERVER_URL}
              token={token}
              onChanged={(newToken) => {
                saveToken(newToken);
                setToken(newToken);
                setPanel(null);
                setMessage("Password changed");
              }}
              onExpired={onExpired}
              onClose={() => setPanel(null)}
            />
          )}

          {panel === "admin" && canManage && (
            <AdminPanel
              serverUrl={SERVER_URL}
              token={token}
              role={role}
              systems={systems.map((s) => ({ id: s.id, name: s.name }))}
              onExpired={onExpired}
              onClose={() => setPanel(null)}
            />
          )}

          {panel === "audit" && canManage && (
            <AuditPanel
              serverUrl={SERVER_URL}
              token={token}
              onExpired={onExpired}
              onClose={() => setPanel(null)}
            />
          )}

          {panel === "health" && canManage && (
            <HealthPanel
              serverUrl={SERVER_URL}
              token={token}
              onStatus={setHealthStatus}
              onExpired={onExpired}
              onClose={() => setPanel(null)}
            />
          )}

          {panel === "fleet" && isMaster && (
            <FleetPanel
              serverUrl={SERVER_URL}
              token={token}
              onExpired={onExpired}
              onClose={() => setPanel(null)}
            />
          )}

          {panel === "updates" && isMaster && (
            <UpdatesPanel
              serverUrl={SERVER_URL}
              token={token}
              onExpired={onExpired}
              onClose={() => setPanel(null)}
            />
          )}

          {openModule && ModuleView && <ModuleView ctx={ctx} />}

          {panel === null && !openModule && (
            <>
              {showForm && canManage && (
                <div className="form">
                  <strong>{editingId ? "Edit system" : "New system"}</strong>
                  <input
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <textarea
                    placeholder="Description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={systemType}
                    onChange={(e) => setSystemType(e.target.value)}
                  >
                    <option value="desktop">Desktop app</option>
                    <option value="web">Web app</option>
                    <option value="file">File</option>
                    <option value="module">Internal module</option>
                  </select>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="planned">Planned</option>
                  </select>
                  {formError && <span className="error">{formError}</span>}
                  <div className="form-actions">
                    <button className="add-btn" onClick={handleSubmit}>
                      {editingId ? "Save changes" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {/* <div className="filters">
                <button
                  className={`chip ${activeCategory === "all" ? "active" : ""}`}
                  onClick={() => setActiveCategory("all")}
                >
                  All apps
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${activeCategory === c.id ? "active" : ""}`}
                    onClick={() => setActiveCategory(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div> */}

              <div className="grid">
                {visible.map((s) => (
                  <div className="card" key={s.id}>
                    <div className="card-top">
                      <div className="tile" style={tileStyle(s.name)}>
                        {initials(s.name)}
                      </div>
                      <div className="card-head">
                        <h3 title={s.name}>{s.name}</h3>
                        <div className="card-meta">
                          <span
                            className={`badge ${s.status} ${s.status === "active" && !targets[s.id] ? "missing" : ""}`}
                          >
                            {s.status === "active"
                              ? targets[s.id]
                                ? "Active"
                                : "Missing"
                              : s.status === "planned"
                                ? "Inactive"
                                : "Archived"}
                          </span>
                          <span className="app-type">{s.systemType}</span>
                        </div>
                      </div>
                      <div className="card-header-actions">
                        {canManage && (
                          <button
                            className="text-action edit-action"
                            onClick={() => startEdit(s)}
                          >
                            Edit
                          </button>
                        )}
                        <div className="card-menu">
                          <button
                            className="menu-btn"
                            aria-label={`More options for ${s.name}`}
                            aria-expanded={openMenuId === s.id}
                            onClick={() =>
                              setOpenMenuId(openMenuId === s.id ? null : s.id)
                            }
                          >
                            <Icon name="more" />
                          </button>
                          {openMenuId === s.id && (
                            <div className="card-menu-popover">
                              <span className="menu-heading">App actions</span>
                              <button
                                className="menu-action"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleChooseProgram(s);
                                }}
                              >
                                Change program
                              </button>
                              <button
                                className="menu-action"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setUrlEditId(s.id);
                                  setUrlValue(
                                    targets[s.id]?.type === "url"
                                      ? targets[s.id].value
                                      : "https://",
                                  );
                                }}
                              >
                                Use link
                              </button>
                              {targets[s.id] && (
                                <button
                                  className="menu-action danger"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setConfirmState({
                                      text: `Remove the launch target for "${s.name}" on this computer?`,
                                      action: () => handleClearTarget(s),
                                    });
                                  }}
                                >
                                  Remove launch target
                                </button>
                              )}
                              {isMaster && (
                                <LocationEditor
                                  systemId={s.id}
                                  locations={locations}
                                  serverUrl={SERVER_URL}
                                  token={token}
                                  onChanged={loadData}
                                  onExpired={onExpired}
                                />
                              )}
                              {canManage && (
                                <>
                                  <span className="menu-heading">
                                    Management
                                  </span>
                                  <button
                                    className="menu-action danger"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConfirmState({
                                        text: `Archive "${s.name}"?`,
                                        action: () => handleArchive(s),
                                      });
                                    }}
                                  >
                                    Archive application
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="card-desc">
                      {s.description || "No description"}
                    </p>
                    <div className="target-info">
                      <span className="target-label">
                        {targets[s.id]?.type === "url"
                          ? "Launch link"
                          : "Launch executable"}
                      </span>
                      {targets[s.id] ? (
                        <>
                          <span
                            className={`target-path ${expandedTargetId === s.id ? "expanded" : ""}`}
                            title={targets[s.id].value}
                          >
                            {targets[s.id].value}
                          </span>
                          <div className="target-actions">
                            <button
                              className="text-action"
                              onClick={() =>
                                setExpandedTargetId(
                                  expandedTargetId === s.id ? null : s.id,
                                )
                              }
                            >
                              {expandedTargetId === s.id
                                ? "Show less"
                                : "View full"}
                            </button>
                            <button
                              className="text-action"
                              onClick={() => handleCopyTarget(s)}
                            >
                              <Icon name="copy" /> Copy
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="target-empty">
                          Not set up on this computer yet
                        </span>
                      )}
                    </div>

                    <div className="primary-actions">
                      {s.status === "active" && (
                        <button
                          className="add-btn"
                          disabled={!targets[s.id]}
                          onClick={() => handleLaunch(s)}
                        >
                          <Icon name="play" /> Launch Application
                        </button>
                      )}
                    </div>

                    {urlEditId === s.id && (
                      <div className="url-edit">
                        <input
                          value={urlValue}
                          onChange={(e) => setUrlValue(e.target.value)}
                        />
                        <button
                          className="add-btn"
                          onClick={() => handleSaveUrl(s)}
                        >
                          Save
                        </button>
                        <button
                          className="link-btn"
                          onClick={() => setUrlEditId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {!targets[s.id] && detected[s.id] && (
                      <div>
                        <p className="target">
                          Found on this computer: {detected[s.id]}
                        </p>
                        <div className="card-actions detected-actions">
                          <button
                            className="add-btn"
                            onClick={() => handleUseDetected(s)}
                          >
                            Use it
                          </button>
                        </div>
                      </div>
                    )}

                    <InstallerControls
                      systemId={s.id}
                      installers={installers.filter((i) => i.systemId === s.id)}
                      isMaster={isMaster}
                      hasTarget={!!targets[s.id] || !!detected[s.id]}
                      serverUrl={SERVER_URL}
                      token={token}
                      onChanged={loadData}
                      onExpired={onExpired}
                      onInstallerStarted={() => setWatching(true)}
                    />
                  </div>
                ))}
              </div>

              {visible.length === 0 && (
                <p className="status">
                  {systems.length === 0 && !canManage
                    ? "No systems have been assigned to you yet. Ask your supervisor."
                    : "No systems found."}
                </p>
              )}
            </>
          )}

          <p className="target footnote">
            This computer reports its Office Hub version and setup status to
            your administrator. Nothing else is sent.
          </p>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  useEffect(() => {
    window.officeHub.getServerUrl().then(setServerUrl);
  }, []);

  if (!serverUrl) {
    return (
      <div className="app-shell">
        <p className="loading">Loading...</p>
      </div>
    );
  }
  return <Hub serverUrl={serverUrl} onServerUrlChanged={setServerUrl} />;
}
