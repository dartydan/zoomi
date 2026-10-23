import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, RefreshCw } from "lucide-react";
import { api, type Account, type Project } from "./api";
import type { AuditSummary, Section } from "./types";
import type { CollectionState } from "./collection-types";
import type { TrackedKeyword, SeoJob } from "./seo-types";
import type { Schedule } from "./Automation";
import { dateTime, ResultTable, metric } from "./seo-ui";

export default function Monitoring({
  project,
  account,
  audits,
  navigate,
}: {
  project: Project;
  account: Account;
  audits: AuditSummary[];
  navigate: (section: Section) => void;
}) {
  const [data, setData] = useState<{
    collection: CollectionState;
    keywords: TrackedKeyword[];
    schedules: Schedule[];
    ranks: SeoJob[];
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const base = `/api/projects/${project.id}`;
        const [collection, keywords, schedules, ranks] = await Promise.all([
          api<CollectionState>(base + "/collection", { signal: abort.signal }),
          api<TrackedKeyword[]>(base + "/keywords", { signal: abort.signal }),
          api<Schedule[]>(base + "/schedules", { signal: abort.signal }),
          api<SeoJob[]>(base + "/seo/jobs?kind=ranks", {
            signal: abort.signal,
          }),
        ]);
        if (!abort.signal.aborted) {
          setData({ collection, keywords, schedules, ranks });
          setError("");
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(refresh, 15000);
      }
    }
    void refresh();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [project.id]);
  const names: Record<string, string> = {
    audit: "Website health",
    google: "Search & visitor data",
    ranks: "Keyword positions",
    collection: "Backlinks & competitors",
  };
  const enabled = data?.schedules.filter((s) => s.frequency !== "off") ?? [];
  const declines =
    data?.keywords.filter(
      (k) =>
        k.active &&
        k.positions[0]?.position != null &&
        k.positions[1]?.position != null &&
        k.positions[0].position - k.positions[1].position >= 3,
    ) ?? [];
  const failed = data?.collection.jobs.find((j) => j.status === "failed");
  const latest = audits[0];
  const activity = [
    ...(data?.collection.jobs.map((j) => ({
      id: j.id,
      label:
        j.purpose === "collection"
          ? `Source crawl · ${j.targetUrl}`
          : "Website health check",
      status: j.status,
      createdAt: j.createdAt,
      error: j.error,
    })) ?? []),
    ...(data?.ranks.map((j) => ({ ...j, label: "Keyword position refresh" })) ??
      []),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  return (
    <div className="seo-page">
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status">Loading your monitoring workspace…</p>
      )}
      <section className="monitoring-hero card">
        <div>
          <span className="eyebrow">YOUR MONITORING PLAN</span>
          <h2>
            {enabled.length
              ? `${enabled.length} recurring checks configured`
              : "Stay close to what’s changing."}
          </h2>
          <p>
            Follow search visibility, website health and incoming links over
            time. Set a schedule for each part of your business.
          </p>
          <p className="seo-caption">
            {account.billing !== "active"
              ? "Activate your subscription to start scheduled collection."
              : !project.verifiedAt
                ? "Verify your website in Connections to start collection."
                : "Completed checks and any interruptions appear in your activity below."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => navigate("Automation")}
        >
          <CalendarClock size={18} /> Manage monitoring
        </button>
      </section>
      <div className="monitoring-metrics">
        <button className="card" onClick={() => navigate("Rank tracking")}>
          <span>Tracked keywords</span>
          <strong>
            {data ? data.keywords.filter((k) => k.active).length : "—"}
          </strong>
          <small>
            Daily average positions <ArrowRight size={14} />
          </small>
        </button>
        <button className="card" onClick={() => navigate("Backlinks")}>
          <span>Observed backlinks</span>
          <strong>{data?.collection.links ?? "—"}</strong>
          <small>
            From pages we have visited <ArrowRight size={14} />
          </small>
        </button>
        <button className="card" onClick={() => navigate("Competitors")}>
          <span>Pages collected</span>
          <strong>{data?.collection.pages.toLocaleString() ?? "—"}</strong>
          <small>
            {data?.collection.sources.length ?? 0} saved websites{" "}
            <ArrowRight size={14} />
          </small>
        </button>
        <button className="card" onClick={() => navigate("Website audit")}>
          <span>Latest website health</span>
          <strong>{latest ? `${latest.score}/100` : "Awaiting check"}</strong>
          <small>
            {latest ? dateTime(latest.createdAt) : "Schedule your first crawl"}{" "}
            <ArrowRight size={14} />
          </small>
        </button>
      </div>
      <div className="monitoring-columns">
        <section className="card">
          <h2>Needs your attention</h2>
          {!!latest?.findingCount && (
            <p>
              <button
                className="text-button"
                onClick={() => navigate("Action plan")}
              >
                {latest.findingCount} website findings from your latest check{" "}
                <ArrowRight size={14} />
              </button>
            </p>
          )}
          {!!data?.collection.missingLinks && (
            <p>
              <button
                className="text-button"
                onClick={() => navigate("Backlinks")}
              >
                {data.collection.missingLinks} backlinks missing on their latest
                recheck <ArrowRight size={14} />
              </button>
            </p>
          )}
          {declines.map((k) => (
            <p key={k.id}>
              <button
                className="text-button"
                onClick={() => navigate("Rank tracking")}
              >
                {k.keyword}: average position declined from{" "}
                {metric(k.positions[1].position)} to{" "}
                {metric(k.positions[0].position)}
              </button>
              <small>
                {k.positions[1].day} → {k.positions[0].day} · {k.device}
              </small>
            </p>
          ))}
          {data?.schedules
            .filter((s) => s.error)
            .map((s) => (
              <p key={s.kind}>
                <strong>{names[s.kind]}</strong>
                <small>{s.error}</small>
              </p>
            ))}
          {failed && (
            <p>
              <strong>A source or website crawl needs attention</strong>
              <small>{failed.error}</small>
            </p>
          )}
          {data &&
            !declines.length &&
            !data.collection.missingLinks &&
            !failed &&
            !latest?.findingCount &&
            !data.schedules.some((s) => s.error) && (
              <p>
                No alerts in the data collected so far. Coverage and reporting
                dates still matter.
              </p>
            )}
          <p className="seo-caption">
            Position alerts flag a decline of at least 3 average positions
            between consecutive reported days. Link alerts require a successful
            recheck. Alerts appear here; email notifications are not enabled.
          </p>
        </section>
        <section className="card">
          <h2>Upcoming monitoring</h2>
          {enabled.length ? (
            enabled.map((s) => (
              <div className="monitoring-schedule" key={s.kind}>
                <strong>{names[s.kind]}</strong>
                <span>
                  {s.nextRunAt ? dateTime(s.nextRunAt) : "Awaiting schedule"}
                </span>
                <small>
                  {s.frequency} · {s.timezone}
                  {s.kind === "collection" ? " · one source per run" : ""}
                </small>
              </div>
            ))
          ) : (
            <p>
              Choose daily, weekly or monthly checks in Automation. Each
              schedule can be paused independently.
            </p>
          )}
          <button
            className="text-button"
            onClick={() => navigate("Automation")}
          >
            Edit schedules <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Collection activity</h2>
            <p>Actual work completed or attempted by Audit.</p>
          </div>
          <RefreshCw size={18} />
        </div>
        <ResultTable
          rows={activity}
          headers={["Monitor", "Status", "Started"]}
          render={(r) => (
            <tr key={r.id}>
              <td>{r.label}</td>
              <td>
                {r.status}
                {r.error && <small>{r.error}</small>}
              </td>
              <td>{dateTime(r.createdAt)}</td>
            </tr>
          )}
        />
        <p className="seo-caption">
          Refreshes automatically. Latest page evidence:{" "}
          {data?.collection.lastSeen
            ? dateTime(data.collection.lastSeen)
            : "No pages collected yet"}
          .
        </p>
      </section>
    </div>
  );
}
