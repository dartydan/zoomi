import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { api, type Project } from "./api";
import type { SeoCapabilities, SeoJob, SeoKind } from "./seo-types";
export const metric = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "Unavailable"
    : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
export const dateTime = (v: string) => new Date(v).toLocaleString();
export const activeJob = (job?: SeoJob) =>
  !!job && ["queued", "running"].includes(job.status);
export function useResearch(project: Project, kind: SeoKind) {
  const base = `/api/projects/${project.id}`;
  const [cap, setCap] = useState<SeoCapabilities>();
  const [reports, setReports] = useState<SeoJob[]>([]);
  const [job, setJob] = useState<SeoJob>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const [c, r] = await Promise.all([
      api<SeoCapabilities>(base + "/seo/capabilities"),
      api<SeoJob[]>(`${base}/seo/jobs?kind=${kind}`),
    ]);
    setCap(c);
    setReports(r);
    return r;
  }, [base, kind]);
  useEffect(() => {
    let mounted = true;
    void refresh()
      .then(async (r) => {
        if (r[0]) {
          const j = await api<SeoJob>(`${base}/seo/jobs/${r[0].id}`);
          if (mounted) setJob(j);
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [base, refresh]);
  useEffect(() => {
    if (!activeJob(job)) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const j = await api<SeoJob>(`${base}/seo/jobs/${job!.id}`);
        if (!mounted) return;
        setJob(j);
        if (activeJob(j)) timer = setTimeout(poll, 3000);
        else await refresh();
      } catch (e) {
        if (mounted) {
          setError(
            e instanceof Error ? e.message : "Could not refresh progress.",
          );
          timer = setTimeout(poll, 10000);
        }
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [base, job?.id, activeJob(job), refresh]);
  async function select(id: string) {
    setBusy(true);
    setError("");
    try {
      setJob(await api<SeoJob>(`${base}/seo/jobs/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open report.");
    } finally {
      setBusy(false);
    }
  }
  async function start(params: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const j = await api<SeoJob>(base + "/seo/jobs", {
        method: "POST",
        body: JSON.stringify({ kind, ...params }),
      });
      setJob(j);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this check.");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!job) return;
    setBusy(true);
    try {
      setJob(
        await api<SeoJob>(`${base}/seo/jobs/${job.id}/cancel`, {
          method: "POST",
        }),
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }
  return {
    base,
    cap,
    reports,
    job,
    error,
    setError,
    busy,
    loading,
    select,
    start,
    cancel,
    refresh,
  };
}
export type ResearchState = ReturnType<typeof useResearch>;
export function ResearchStatus({
  state,
  project,
  backlinks = false,
}: {
  state: ResearchState;
  project: Project;
  backlinks?: boolean;
}) {
  const { job, cap } = state;
  return (
    <>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      {!cap && state.loading && (
        <p role="status">
          <LoaderCircle size={16} className="spin" /> Loading your saved
          research…
        </p>
      )}
      {!cap && !state.loading && (
        <button
          className="button secondary"
          onClick={() =>
            void state.refresh().catch((e) => state.setError(e.message))
          }
        >
          Reload research
        </button>
      )}
      {cap && !(backlinks ? cap.backlinksConfigured : cap.configured) && (
        <div className="configuration-note">
          Connect a matching Google Search Console property in Connections to
          monitor daily average positions. Audit stores your private history and
          collects backlink evidence with its own crawler.
        </div>
      )}
      {!project.verifiedAt && (
        <p className="seo-caption">
          Verify this website in Connections before running new checks. New
          checks also require an active subscription.
        </p>
      )}
      {cap?.configured && (
        <p className="seo-caption">
          Refresh up to 50 active keywords once per day. Each refresh collects
          the latest 28 finalized reporting days, ending three days ago. Enable
          automatic refreshes in Automation.
        </p>
      )}
      {state.reports.length > 0 && (
        <label className="seo-report-select">
          Saved check
          <select
            value={job?.id ?? ""}
            disabled={state.loading || state.busy || activeJob(job)}
            onChange={(e) => void state.select(e.target.value)}
          >
            {state.reports.map((r) => (
              <option key={r.id} value={r.id}>
                {dateTime(r.createdAt)} ·{" "}
                {r.params.competitor ?? r.params.country ?? r.kind} · {r.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {job && (
        <div className="seo-job" role="status">
          <div>
            <strong>
              {activeJob(job)
                ? "Checking your search data"
                : job.status === "complete"
                  ? "Check complete"
                  : job.status === "partial"
                    ? "Some sections need attention"
                    : job.status === "cancelled"
                      ? "Check cancelled"
                      : "Check needs attention"}
            </strong>
            <span>
              {job.done} of {job.total} requests processed ·{" "}
              {dateTime(job.createdAt)}
            </span>
            {job.error && <p>{job.error}</p>}
          </div>
          {activeJob(job) && (
            <>
              <progress
                value={job.done}
                max={job.total}
                aria-label="Research progress"
              />
              <button
                className="button secondary"
                disabled={state.busy}
                onClick={() => void state.cancel()}
              >
                Cancel check
              </button>
            </>
          )}
        </div>
      )}
      {job &&
        !activeJob(job) &&
        job.params.day === new Date().toISOString().slice(0, 10) && (
          <p className="seo-caption">
            This UTC day’s check is saved. A fresh check is available tomorrow;
            opening it again today reuses these results.
          </p>
        )}
      {job?.status === "cancelled" && (
        <p className="seo-caption">
          Saved sections are available below. A request already sent may still
          count toward usage.
        </p>
      )}
      {job?.parts
        ?.filter((p) => p.error)
        .map((p) => (
          <div className="configuration-note" key={p.key}>
            <strong>{p.label}: </strong>
            {p.error}
          </div>
        ))}
    </>
  );
}
export function RefreshResearch({
  state,
  project,
  label = "Refresh report",
  params = {},
  backlinks = false,
}: {
  state: ResearchState;
  project: Project;
  label?: string;
  params?: Record<string, unknown>;
  backlinks?: boolean;
}) {
  return (
    <button
      className="button primary"
      disabled={
        state.loading ||
        state.busy ||
        activeJob(state.job) ||
        !project.verifiedAt ||
        !(backlinks ? state.cap?.backlinksConfigured : state.cap?.configured)
      }
      onClick={() => void state.start(params)}
    >
      {state.busy || activeJob(state.job) ? (
        <LoaderCircle className="spin" size={16} />
      ) : (
        <RefreshCw size={16} />
      )}{" "}
      {label}
    </button>
  );
}
export function part<T>(job: SeoJob | undefined, key: string): T | undefined {
  return job?.parts?.find((p) => p.key === key)?.data as T | undefined;
}
export function CsvButton({ name, rows }: { name: string; rows: unknown[][] }) {
  return (
    <button
      className="button secondary"
      disabled={rows.length < 2}
      onClick={() => downloadCsv(name, rows)}
    >
      <Download size={15} /> Export CSV
    </button>
  );
}
export function csvText(rows: unknown[][]) {
  return (
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text =
              value === null || value === undefined ? "" : String(value);
            if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
function downloadCsv(name: string, rows: unknown[][]) {
  const u = URL.createObjectURL(
    new Blob([csvText(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function ResultTable<T>({
  rows,
  headers,
  render,
  empty = "No matching rows in this saved dataset.",
  pageSize = 25,
}: {
  rows: T[];
  headers: string[];
  render: (row: T, index: number) => ReactNode;
  empty?: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(rows.length / pageSize);
  const current = Math.min(page, Math.max(0, pages - 1));
  return (
    <>
      {rows.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Scrollable results table"
        >
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(current * pageSize, (current + 1) * pageSize)
                .map((r, i) => render(r, current * pageSize + i))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>{empty}</p>
        </div>
      )}
      {pages > 1 && (
        <div className="seo-pagination">
          <button
            className="button secondary"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            {current + 1} / {pages} · {rows.length} rows
          </span>
          <button
            className="button secondary"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
export function WebLink({
  url,
  children,
}: {
  url: string | null;
  children?: ReactNode;
}) {
  return url ? (
    <a
      className="seo-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children ?? url}
    </a>
  ) : (
    <span>Unavailable</span>
  );
}
