import { useEffect, useState } from "react";
import type { ModuleContext } from "../types";

export default function HelloModule({ ctx }: { ctx: ModuleContext }) {
  const [data, setData] = useState<{ message: string; time: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${ctx.serverUrl}/api/modules/hello`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          ctx.onExpired();
          return;
        }
        if (!res.ok) throw new Error();
        setData(await res.json());
      })
      .catch(() => setError("Could not reach the server."));
  }, []);

  return (
    <div className="form">
      <strong>Hello module</strong>
      <span className="status">
        Logged in as {ctx.username} ({ctx.role})
      </span>
      {data && <span className="status">Server says: {data.message} ({data.time})</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}