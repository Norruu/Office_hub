import { useState, type FormEvent } from "react";
import LoginArt from "./LoginArt";
import UpdateBanner from "./UpdateBanner";
import "../login.css";

type Props = {
  serverUrl: string;
  message: string;
  onLoggedIn: (token: string, username: string, role: string, remember: boolean) => void;
  onServerUrlChanged: (url: string) => void;
};

type View = "login" | "signup" | "server";

export default function LoginScreen({ serverUrl, message, onLoggedIn, onServerUrlChanged }: Props) {
  const [view, setView] = useState<View>("login");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [forgot, setForgot] = useState(false);

  // request an account
  const [suUser, setSuUser] = useState("");
  const [suPass, setSuPass] = useState("");
  const [suAgain, setSuAgain] = useState("");
  const [suDone, setSuDone] = useState(false);

  // server address
  const [serverInput, setServerInput] = useState(serverUrl);

  function go(next: View) {
    setView(next);
    setError("");
    setNote("");
    setForgot(false);
    setSuDone(false);
    setServerInput(serverUrl);
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${serverUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      onLoggedIn(data.token, data.user.username, data.user.role, remember);
    } catch {
      setError("Can't reach the server. Check the address at the bottom.");
    } finally {
      setBusy(false);
    }
  }

  async function signup(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(suUser.trim())) {
      setError("Use 3 or more letters, numbers, dots, dashes or underscores for the username.");
      return;
    }
    if (suPass.length < 10) {
      setError("The password needs at least 10 characters.");
      return;
    }
    if (suPass !== suAgain) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${serverUrl}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: suUser.trim(), password: suPass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send the request.");
        return;
      }
      setSuDone(true);
    } catch {
      setError("Can't reach the server. Check the address at the bottom.");
    } finally {
      setBusy(false);
    }
  }

  async function saveServer(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    const result = await window.officeHub.setServerUrl(serverInput);
    if (!result.ok || !result.url) {
      setError(result.error ?? "Could not save the address.");
      return;
    }
    setServerInput(result.url);
    onServerUrlChanged(result.url);
    try {
      const res = await fetch(`${result.url}/api/health`, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      if (data.status === "ok") setNote("Saved. The server answered.");
      else setError("Saved, but that address doesn't look like Office Hub.");
    } catch {
      setError("Saved, but the server did not answer. Check the address and that the server is running.");
    }
  }

  const serverLine = (
    <p className="login-small">
      Server: {serverUrl}{" "}
      <button type="button" className="login-link" onClick={() => go("server")}>
        Change
      </button>
    </p>
  );

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-art">
          <LoginArt />
        </div>

        <div className="login-form">
          <div className="login-form-inner">
            <p className="login-brand">Office Hub</p>

            {view === "login" && (
              <form onSubmit={login} noValidate>
                <h1 className="login-title">
                  Hello,
                  <br />
                  Welcome back
                </h1>
                {message && <p className="login-message">{message}</p>}

                <div className="login-field">
                  <input
                    placeholder="Username"
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="login-field">
                  <input
                    type={showPw ? "text" : "password"}
                    placeholder="Password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="button" className="login-show" onClick={() => setShowPw(!showPw)}>
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
                {error && <p className="login-error">{error}</p>}

                <div className="login-row">
                  <label title="Stay signed in on this computer (up to 12 hours)">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Remember me
                  </label>
                  <button type="button" className="login-link" onClick={() => setForgot(!forgot)}>
                    Forgot password?
                  </button>
                </div>
                {forgot && (
                  <p className="login-info">
                    Ask your supervisor or the master to reset it for you (Employees and jobs, then Reset password).
                    You can change it again yourself after you log in.
                  </p>
                )}

                <button className="login-btn" type="submit" disabled={busy}>
                  {busy ? "Signing in..." : "Login"}
                </button>
                <p className="login-foot">
                  Don't have an account?{" "}
                  <button type="button" className="login-link strong" onClick={() => go("signup")}>
                    Request one
                  </button>
                </p>
                {serverLine}
              </form>
            )}

            {view === "signup" && !suDone && (
              <form onSubmit={signup} noValidate>
                <h1 className="login-title">
                  Request
                  <br />
                  an account
                </h1>
                <div className="login-field">
                  <input placeholder="Choose a username" autoFocus value={suUser} onChange={(e) => setSuUser(e.target.value)} />
                </div>
                <div className="login-field">
                  <input
                    type="password"
                    placeholder="Choose a password (10+ characters)"
                    autoComplete="new-password"
                    value={suPass}
                    onChange={(e) => setSuPass(e.target.value)}
                  />
                </div>
                <div className="login-field">
                  <input
                    type="password"
                    placeholder="Password again"
                    autoComplete="new-password"
                    value={suAgain}
                    onChange={(e) => setSuAgain(e.target.value)}
                  />
                </div>
                {error && <p className="login-error">{error}</p>}
                <button className="login-btn" type="submit" disabled={busy}>
                  {busy ? "Sending..." : "Send request"}
                </button>
                <p className="login-foot">
                  <button type="button" className="login-link strong" onClick={() => go("login")}>
                    Back to login
                  </button>
                </p>
                {serverLine}
              </form>
            )}

            {view === "signup" && suDone && (
              <div>
                <h1 className="login-title">
                  Request
                  <br />
                  sent
                </h1>
                <p className="login-info">
                  A supervisor needs to approve your account before you can log in. Ask them to check the waiting
                  requests.
                </p>
                <button className="login-btn" type="button" onClick={() => go("login")}>
                  Back to login
                </button>
              </div>
            )}

            {view === "server" && (
              <form onSubmit={saveServer} noValidate>
                <h1 className="login-title">
                  Server
                  <br />
                  address
                </h1>
                <div className="login-field">
                  <input
                    placeholder="https://192.168.1.20:3000"
                    autoFocus
                    value={serverInput}
                    onChange={(e) => setServerInput(e.target.value)}
                  />
                </div>
                {error && <p className="login-error">{error}</p>}
                {note && <p className="login-note">{note}</p>}
                <button className="login-btn" type="submit">
                  Save and test
                </button>
                <p className="login-foot">
                  <button type="button" className="login-link strong" onClick={() => go("login")}>
                    Back to login
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="login-update">
        <UpdateBanner />
      </div>
    </div>
  );
}