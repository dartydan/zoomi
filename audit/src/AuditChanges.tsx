import { useEffect, useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
import type { AuditComparison, ChangeStatus } from "../server/comparison";
const labels: Record<ChangeStatus, string> = {
  resolved: "Verified fixes",
  new: "New findings",
  persisting: "Still present",
  unverified: "Not verified",
};
type Result = AuditComparison & { next: number | null; offset: number };
export default function AuditChanges({
  base,
  id,
}: {
  base: string;
  id: string;
}) {
  const [result, setResult] = useState<Result | null>();
  const [status, setStatus] = useState<ChangeStatus>("resolved");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setOffset(0);
  }, [id, status]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void api<Result | null>(
      `${base}/audits/${id}/changes?status=${status}&offset=${offset}`,
    )
      .then((r) => {
        if (alive) setResult(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [base, id, status, offset, attempt]);
  return (
    <section className="card audit-changes">
      <div className="section-head">
        <div>
          <span className="eyebrow">MEASURED PROGRESS</span>
          <h2>
            <CheckCheck size={21} /> What actually changed?
          </h2>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {error ? (
        <button
          className="button secondary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try again
        </button>
      ) : result === null ? (
        <p>
          After your next audit, compare its evidence with this baseline to see
          what improved and what needs attention.
        </p>
      ) : result && !result.compatible ? (
        <p>
          The checks changed between these audits. Run another audit using the
          current checks to establish a comparable baseline.
        </p>
      ) : result ? (
        <>
          <p>
            Compared with {new Date(result.previousDate).toLocaleString()}.{" "}
            {result.coverage.sharedPages.toLocaleString()} pages appeared in
            both scans; {result.coverage.addedPages.toLocaleString()} appeared
            for the first time and{" "}
            {result.coverage.uncheckedPages.toLocaleString()} earlier pages were
            not checked this time.
          </p>
          <div className="change-tabs" aria-label="Types of change">
            {(Object.keys(labels) as ChangeStatus[]).map((k) => (
              <button
                key={k}
                aria-pressed={status === k}
                className={status === k ? "active" : ""}
                onClick={() => setStatus(k)}
              >
                <strong>{result.counts[k].toLocaleString()}</strong>
                {labels[k]}
              </button>
            ))}
          </div>
          <p className="muted">
            {status === "resolved"
              ? "The latest scan no longer found this issue on a successfully checked page. Marking an action done does not count as a verified fix."
              : status === "unverified"
                ? "These issues could not be checked again. A missing, blocked, or failed page is not proof of a fix."
                : status === "new"
                  ? "These issues were found in the latest scan. Some may be on pages that were not checked before."
                  : "These page-level issues are present in both scans."}
          </p>
          {loading ? (
            <div className="empty">
              <LoaderCircle className="spin" />
              Loading changes…
            </div>
          ) : result.changes.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Finding</th>
                    <th>Page</th>
                    <th>Context</th>
                  </tr>
                </thead>
                <tbody>
                  {result.changes.map((c) => (
                    <tr key={`${c.findingId}:${c.url}`}>
                      <td>{c.title}</td>
                      <td>
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {c.url}
                        </a>
                      </td>
                      <td>
                        {c.newlyDiscovered
                          ? "First observed in this scan"
                          : labels[c.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <p>No {labels[status].toLowerCase()} in this comparison.</p>
            </div>
          )}
          {(offset > 0 || result.next !== null) && (
            <div className="comparison-pagination">
              <button
                className="button secondary"
                disabled={loading || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>Page {Math.floor(offset / 100) + 1}</span>
              <button
                className="button secondary"
                disabled={loading || result.next === null}
                onClick={() => setOffset(result.next!)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="empty">
          <LoaderCircle className="spin" />
          Loading comparison…
        </div>
      )}
    </section>
  );
}
