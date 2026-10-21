import { useEffect, useState } from "react";
import { Check, LoaderCircle, Pause, RefreshCw } from "lucide-react";
import { api, type Account, type Project } from "./api";
type Kind = "audit" | "google" | "ranks";
interface Schedule {
  dirty?: boolean;
  kind: Kind;
  frequency: "off" | "daily" | "weekly" | "monthly";
  timezone: string;
  hour: number;
  weekday: number;
  pageLimit: number;
  nextRunAt?: string;
  lastRunAt?: string;
  status?: string;
  error?: string;
}
interface Run {
  id: string;
  kind: string;
  status: string;
  error?: string;
  createdAt: string;
}
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export default function Automation({
  project,
  account,
}: {
  project: Project;
  account: Account;
}) {
  const base = `/api/projects/${project.id}`;
  const [rows, setRows] = useState<Schedule[]>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Array.from(
    new Set([timezone, "UTC", ...Intl.supportedValuesOf("timeZone")]),
  );
  const defaults = (kind: Kind): Schedule => ({
    kind,
    frequency: "off",
    timezone,
    hour: 9,
    weekday: 1,
    pageLimit: account.limits.pages,
  });
  async function load(preserveDrafts = false) {
    setError("");
    const [s, r] = await Promise.all([
      api<Schedule[]>(`${base}/schedules`),
      api<Run[]>(`${base}/automation-runs`),
    ]);
    setRows((current) =>
      (["audit", "google", "ranks"] as Kind[]).map((k) => {
        const saved = s.find((x) => x.kind === k) ?? defaults(k);
        const draft = current?.find((x) => x.kind === k);
        return preserveDrafts && draft
          ? {
              ...draft,
              nextRunAt: saved.nextRunAt,
              lastRunAt: saved.lastRunAt,
              status: saved.status,
              error: saved.error,
            }
          : saved;
      }),
    );
    setRuns(r);
  }
  useEffect(() => {
    void load(true).catch((e) => setError(e.message));
  }, [project.id]);
  function update(kind: Kind, changes: Partial<Schedule>) {
    setRows((current) =>
      current?.map((s) =>
        s.kind === kind ? { ...s, ...changes, dirty: true } : s,
      ),
    );
    setNotice("");
  }
  async function save(s: Schedule) {
    setBusy(s.kind);
    setError("");
    setNotice("");
    try {
      const saved = await api<Schedule[]>(`${base}/schedules/${s.kind}`, {
        method: "PUT",
        body: JSON.stringify(s),
      });
      setRows((current) =>
        current?.map((row) =>
          row.kind === s.kind
            ? saved.find((value) => value.kind === s.kind)!
            : row,
        ),
      );
      setNotice(
        s.frequency === "off"
          ? "Schedule paused."
          : "Schedule saved. Your next run is shown below.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save your schedule.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="automation-page">
      {account.billing !== "active" && (
        <div className="configuration-note">
          You can set your preferences now. Automatic checks begin after your
          subscription is active and your website is connected.
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {!rows && error ? (
        <button
          className="button secondary"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          Try again
        </button>
      ) : !rows ? (
        <div className="empty">
          <LoaderCircle className="spin" />
          Loading your schedules…
        </div>
      ) : (
        <div className="automation-grid">
          {rows.map((s) => (
            <section className="card schedule-card" key={s.kind}>
              <span className="eyebrow">
                {s.kind === "audit"
                  ? "WEBSITE CHECKS"
                  : s.kind === "ranks"
                    ? "KEYWORD POSITIONS"
                    : "GOOGLE DATA"}
              </span>
              <h2>
                {s.kind === "audit"
                  ? "Recurring website audit"
                  : s.kind === "ranks"
                    ? "Automatic rank tracking"
                    : "Keep your data fresh"}
              </h2>
              <p>
                {s.kind === "audit"
                  ? "Find new problems and confirm improvements without remembering to start another scan. Scheduled audits use your monthly allowance."
                  : s.kind === "ranks"
                    ? "Save your preferred ranking schedule. Checks remain inactive until Audit’s direct search-result collector is ready. Website audits already collect page and link evidence."
                    : "Refresh the Search Console and Analytics properties you have connected. Google’s reporting delay still applies."}
              </p>
              <label>
                How often
                <select
                  value={s.frequency}
                  onChange={(e) =>
                    update(s.kind, {
                      frequency: e.target.value as Schedule["frequency"],
                    })
                  }
                >
                  <option value="off">Paused</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">On the first of each month</option>
                </select>
              </label>
              {s.frequency !== "off" && (
                <>
                  <div className="schedule-fields">
                    {s.frequency === "weekly" && (
                      <label>
                        Day
                        <select
                          value={s.weekday}
                          onChange={(e) =>
                            update(s.kind, { weekday: Number(e.target.value) })
                          }
                        >
                          {days.map((d, i) => (
                            <option value={i} key={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Start around
                      <select
                        value={s.hour}
                        onChange={(e) =>
                          update(s.kind, { hour: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option
                            key={h}
                            value={h}
                          >{`${String(h).padStart(2, "0")}:00`}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Timezone
                    <select
                      value={s.timezone}
                      onChange={(e) =>
                        update(s.kind, { timezone: e.target.value })
                      }
                    >
                      {zones.map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                  {s.kind === "audit" && (
                    <label>
                      Pages per audit
                      <input
                        type="number"
                        min={100}
                        max={account.limits.pages}
                        step={100}
                        value={s.pageLimit}
                        onChange={(e) =>
                          update(s.kind, { pageLimit: Number(e.target.value) })
                        }
                      />
                      <small>
                        Up to {account.limits.pages.toLocaleString()} pages,
                        using your normal plan allowance.
                      </small>
                    </label>
                  )}
                </>
              )}
              <button
                className="button primary"
                disabled={!!busy}
                onClick={() => save(s)}
              >
                {busy === s.kind ? (
                  <LoaderCircle className="spin" size={16} />
                ) : s.frequency === "off" ? (
                  <Pause size={16} />
                ) : (
                  <Check size={16} />
                )}
                Save{" "}
                {s.kind === "audit"
                  ? "audit"
                  : s.kind === "ranks"
                    ? "rank"
                    : "refresh"}{" "}
                schedule
              </button>
              <div className="schedule-status">
                <strong>
                  {s.dirty
                    ? "Unsaved changes. Save to update your schedule."
                    : s.nextRunAt
                      ? `Next: ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: s.timezone }).format(new Date(s.nextRunAt))} (${s.timezone})`
                      : "Paused"}
                </strong>
                <small>
                  {s.lastRunAt
                    ? `Last queued: ${new Date(s.lastRunAt).toLocaleString()}`
                    : "No automatic runs yet."}
                </small>
                {s.error && <p role="status">{s.error}</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="scope-note">
        <p>
          Start times are approximate. An audit waits if another audit is
          running or your monthly allowance has been used. Pausing stops future
          runs; cancel a check already in progress from its progress panel. Rank
          checks share the daily search-data allowance and reuse checks from the
          same UTC day.
        </p>
      </div>
      <section className="card">
        <div className="section-head">
          <h2>Recent automatic refreshes</h2>
          <button
            className="text-button"
            onClick={() => void load(true).catch((e) => setError(e.message))}
          >
            <RefreshCw size={16} />
            Refresh status
          </button>
        </div>
        {runs.length ? (
          <div className="automation-log">
            {runs.map((r) => (
              <div key={r.id}>
                <span>{new Date(r.createdAt).toLocaleString()}</span>
                <strong>
                  {r.status === "complete"
                    ? "Data refreshed"
                    : r.status === "attention"
                      ? "Needs attention"
                      : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </strong>
                {r.error && <p>{r.error}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p>
            When a scheduled Google refresh runs, its result will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
