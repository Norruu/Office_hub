import { useState } from "react";

type Props = {
  serverUrl: string;
  token: string;
  onChanged: (newToken: string) => void;
  onExpired: () => void;
  onClose: () => void;
};

export default function PasswordPanel({ serverUrl, token, onChanged, onExpired, onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (next.length < 10) {
      setError("The new password needs at least 10 characters.");
      return;
    }
    if (next !== again) {
      setError("The two new passwords don't match.");
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/me/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.status === 401) {
        onExpired();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not change the password.");
        return;
      }
      onChanged(data.token);
    } catch {
      setError("Server unreachable.");
    }
  }

  return (
    <div className="form">
      <strong>Change my password</strong>
      <input type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input type="password" placeholder="New password (10+ characters)" value={next} onChange={(e) => setNext(e.target.value)} />
      <input type="password" placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} />
      {error && <span className="error">{error}</span>}
      <div className="form-actions">
        <button className="add-btn" onClick={submit}>
          Change password
        </button>
        <button className="link-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}