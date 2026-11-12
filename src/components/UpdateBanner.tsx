import { useEffect, useState } from "react";

type UpdateState = Awaited<ReturnType<Window["officeHub"]["getUpdateState"]>>;

export default function UpdateBanner() {
  const [version, setVersion] = useState("");
  const [state, setState] = useState<UpdateState>({ state: "idle" });
  const [error, setError] = useState("");

  useEffect(() => {
    window.officeHub.getAppVersion().then(setVersion);
    window.officeHub.getUpdateState().then(setState);
    return window.officeHub.onUpdateState(setState);
  }, []);

  async function check() {
    setError("");
    setState(await window.officeHub.checkForUpdates());
  }

  async function apply() {
    setError("");
    const result = await window.officeHub.applyUpdate();
    if (!result.ok) setError(result.error ?? "Could not start the update.");
  }

  return (
    <div className="update-banner">
      <span>Office Hub v{version}</span>
      {state.state === "checking" && <span>Checking for updates...</span>}
      {state.state === "downloading" && (
        <span>
          Downloading update {state.version}... {state.percent}%
        </span>
      )}
      {state.state === "ready" && (
        <>
          <span>Update {state.version} is ready.</span>
          <button className="add-btn" onClick={apply}>
            Restart and update
          </button>
          {state.notes && <span className="target">{state.notes}</span>}
        </>
      )}
      {state.state === "error" && <span className="error">{state.message}</span>}
      {state.state === "idle" && state.message && <span>{state.message}</span>}
      {(state.state === "idle" || state.state === "error") && (
        <button className="link-btn" onClick={check}>
          Check for updates
        </button>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}