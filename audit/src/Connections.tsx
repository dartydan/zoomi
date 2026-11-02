import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  Link2,
  LoaderCircle,
  RefreshCw,
  Search,
  Unplug,
} from "lucide-react";
import { api, type Project } from "./api";
interface Connection {
  configured: boolean;
  connected: boolean;
  searchConsole?: string;
  analytics?: string;
}
interface Properties {
  searchConsole: { siteUrl: string; permissionLevel: string }[];
  analytics: { property: string; displayName: string; account: string }[];
  errors: string[];
}
export interface Metrics {
  syncedAt: string;
  errors: string[];
  searchConsole?: {
    startDate: string;
    endDate: string;
    summary: {
      rows?: {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }[];
    };
    queries: {
      rows?: {
        keys: string[];
        clicks: number;
        impressions: number;
        position: number;
      }[];
    };
  };
  analytics?: { summary: { rows?: { metricValues: { value: string }[] }[] } };
}
export default function Connections({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate?: () => void;
}) {
  const base = `/api/projects/${project.id}`;
  const [connection, setConnection] = useState<Connection>();
  const [properties, setProperties] = useState<Properties>();
  const [gsc, setGsc] = useState("");
  const [ga, setGa] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    const c = await api<Connection>(`${base}/connections`);
    setConnection(c);
    setGsc(c.searchConsole ?? "");
    setGa(c.analytics ?? "");
    setMetrics(await api<Metrics | null>(`${base}/metrics`));
    if (c.connected)
      setProperties(await api<Properties>(`${base}/connections/properties`));
    else setProperties(undefined);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [project.id]);
  async function perform(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this connection.",
      );
    } finally {
      setBusy("");
    }
  }
  const start = () =>
    perform("connect", async () => {
      const result = await api<{ url: string }>(`${base}/connections/google`, {
        method: "POST",
        body: "{}",
      });
      location.assign(result.url);
    });
  return (
    <>
      <div className="connection-intro">
        <Link2 size={23} />
        <p>
          Connect the Google account you use for this website. Choose the
          matching Search Console and Analytics properties to bring real
          performance data into Audit.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="success-banner">{notice}</div>}
      {!connection ? (
        <div className="empty">
          <LoaderCircle className="spin" />
        </div>
      ) : (
        <>
          <section className="card connected-account">
            <div>
              <span className="pill sage">Read-only access</span>
              <h2>
                {connection.connected
                  ? "Your Google account is connected."
                  : "Start with your Google account."}
              </h2>
              <p>
                {connection.connected
                  ? "Choose the properties for this website below. You stay in control and can disconnect at any time."
                  : "Your password stays with Google. Audit asks permission to read your search performance and website analytics."}
              </p>
            </div>
            <button
              className="button primary"
              disabled={!!busy || !connection.configured}
              onClick={start}
            >
              {busy === "connect" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Link2 size={17} />
              )}{" "}
              {connection.connected ? "Reconnect Google" : "Connect Google"}
            </button>
            {!connection.configured && (
              <div className="configuration-note">
                Google authorization is awaiting activation by Zoomi. No account
                has been connected and no data has been imported.
              </div>
            )}
          </section>
          {connection.connected && (
            <section className="card property-picker">
              <h2>Choose your website’s data</h2>
              {properties?.errors.map((e) => (
                <div className="error-banner" key={e}>
                  {e}
                </div>
              ))}
              <div className="property-grid">
                <label>
                  <Search size={18} />
                  Google Search Console
                  <select value={gsc} onChange={(e) => setGsc(e.target.value)}>
                    <option value="">Choose a matching property</option>
                    {properties?.searchConsole.map((p) => (
                      <option key={p.siteUrl} value={p.siteUrl}>
                        {p.siteUrl}
                      </option>
                    ))}
                  </select>
                  <small>
                    Owner or full access also verifies this website in Audit.
                  </small>
                </label>
                <label>
                  <BarChart3 size={18} />
                  Google Analytics 4
                  <select value={ga} onChange={(e) => setGa(e.target.value)}>
                    <option value="">Choose a property</option>
                    {properties?.analytics.map((p) => (
                      <option key={p.property} value={p.property}>
                        {p.displayName} · {p.account}
                      </option>
                    ))}
                  </select>
                  <small>
                    We check that its web stream matches this website.
                  </small>
                </label>
              </div>
              <div className="connection-controls">
                <button
                  className="button primary"
                  disabled={!!busy || !properties}
                  onClick={() =>
                    perform("save", async () => {
                      await api(`${base}/connections/properties`, {
                        method: "POST",
                        body: JSON.stringify({
                          searchConsole: gsc || undefined,
                          analytics: ga || undefined,
                        }),
                      });
                      await load();
                      onUpdate?.();
                      setNotice(
                        "Properties saved. Your website connection is ready to sync.",
                      );
                    })
                  }
                >
                  {busy === "save" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  Save connections
                </button>
                <button
                  className="button secondary"
                  disabled={
                    !!busy ||
                    !(connection.searchConsole || connection.analytics)
                  }
                  onClick={() =>
                    perform("sync", async () => {
                      setMetrics(
                        await api<Metrics>(`${base}/connections/sync`, {
                          method: "POST",
                          body: "{}",
                        }),
                      );
                      setNotice("Your connected data has been refreshed.");
                    })
                  }
                >
                  {busy === "sync" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  Sync data
                </button>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() =>
                    perform("disconnect", async () => {
                      await api(`${base}/connections/google`, {
                        method: "DELETE",
                      });
                      await load();
                      setNotice(
                        "Google has been disconnected and imported metrics removed.",
                      );
                    })
                  }
                >
                  <Unplug size={16} />
                  Disconnect
                </button>
              </div>
            </section>
          )}
          <Performance metrics={metrics} />
        </>
      )}
    </>
  );
}
export function Performance({ metrics }: { metrics: Metrics | null }) {
  if (!metrics)
    return (
      <section className="card">
        <div className="empty">
          <BarChart3 size={32} />
          <h3>Your performance data will appear here.</h3>
          <p>
            Connect a property and sync it to see clicks, impressions, visitors,
            and key events. No estimates are substituted for your data.
          </p>
        </div>
      </section>
    );
  const search = metrics.searchConsole?.summary.rows?.[0];
  const ga = metrics.analytics?.summary.rows?.[0]?.metricValues;
  return (
    <>
      <div className="performance-stats">
        <div className="card">
          <span>Search clicks</span>
          <b>{search?.clicks.toLocaleString() ?? "—"}</b>
          <small>Google Search Console</small>
        </div>
        <div className="card">
          <span>Search impressions</span>
          <b>{search?.impressions.toLocaleString() ?? "—"}</b>
          <small>Google Search Console</small>
        </div>
        <div className="card">
          <span>Active visitors</span>
          <b>{ga?.[0]?.value ?? "—"}</b>
          <small>Google Analytics 4</small>
        </div>
        <div className="card">
          <span>Key events</span>
          <b>{ga?.[2]?.value ?? "—"}</b>
          <small>Configured in your Analytics property</small>
        </div>
      </div>
      <div className="scope-note">
        <p>
          Last synced {new Date(metrics.syncedAt).toLocaleString()}. Search data
          covers {metrics.searchConsole?.startDate ?? "—"} through{" "}
          {metrics.searchConsole?.endDate ?? "—"}; Analytics covers the last 28
          complete days. Provider reporting delays apply.
        </p>
      </div>
      {metrics.errors.map((e) => (
        <div className="error-banner" key={e}>
          {e}
        </div>
      ))}
      {metrics.searchConsole && (
        <section className="card">
          <div className="section-head">
            <h2>What people search for</h2>
            <span className="pill sage">Actual Search Console data</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Search query</th>
                  <th>Clicks</th>
                  <th>Impressions</th>
                  <th>Average position</th>
                </tr>
              </thead>
              <tbody>
                {metrics.searchConsole.queries.rows?.map((r) => (
                  <tr key={r.keys.join()}>
                    <td>{r.keys.join(" · ")}</td>
                    <td>{r.clicks}</td>
                    <td>{r.impressions}</td>
                    <td>{r.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="scope-note">
            <p>
              Average position is a Search Console aggregate, not a
              location-specific daily rank. Google may omit low-volume queries.
            </p>
          </div>
        </section>
      )}
    </>
  );
}
