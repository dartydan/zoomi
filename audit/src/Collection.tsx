import { useCallback, useEffect, useState } from "react";
import { Database, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { api, type Project } from "./api";
import { CsvButton, dateTime, ResultTable, WebLink } from "./seo-ui";
import type {
  CollectionState,
  CollectionPage,
  CollectedLink,
  CollectedPage,
} from "./collection-types";
import type { Competitor } from "./seo-types";
const active = (status: string) => ["queued", "running"].includes(status);
export default function Collection({
  project,
  view,
}: {
  project: Project;
  view: "links" | "pages";
}) {
  const base = `/api/projects/${project.id}`;
  const [state, setState] = useState<CollectionState>();
  const [rivals, setRivals] = useState<Competitor[]>([]);
  const [domain, setDomain] = useState("");
  const [input, setInput] = useState("");
  const [limit, setLimit] = useState(10000);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkState, setLinkState] = useState("present");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] =
    useState<CollectionPage<CollectedLink | CollectedPage>>();
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const [data, list] = await Promise.all([
      api<CollectionState>(base + "/collection"),
      api<Competitor[]>(base + "/competitors"),
    ]);
    setState(data);
    setRivals(list);
    setDomain((d) =>
      data.sources.some((s) => s.domain === d)
        ? d
        : ((
            data.sources.find(
              (s) => view === "pages" && s.kind === "competitor",
            ) ?? data.sources[0]
          )?.domain ?? ""),
    );
  }, [base, view]);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [data, list] = await Promise.all([
          api<CollectionState>(base + "/collection", { signal: abort.signal }),
          api<Competitor[]>(base + "/competitors", { signal: abort.signal }),
        ]);
        if (abort.signal.aborted) return;
        setState(data);
        setRivals(list);
        setDomain((d) =>
          data.sources.some((s) => s.domain === d)
            ? d
            : ((
                data.sources.find(
                  (s) => view === "pages" && s.kind === "competitor",
                ) ?? data.sources[0]
              )?.domain ?? ""),
        );
        timer = setTimeout(
          poll,
          data.jobs.some((j) => active(j.status)) ? 3000 : 15000,
        );
      } catch (e) {
        if (!abort.signal.aborted) {
          setError((e as Error).message);
          timer = setTimeout(poll, 15000);
        }
      }
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [base, view]);
  useEffect(() => {
    if (!domain) return;
    const abort = new AbortController();
    setLoading(true);
    setRows(undefined);
    const query =
      view === "links"
        ? `/collection/links?state=${linkState}&offset=${offset}`
        : `/collection/pages?domain=${encodeURIComponent(domain)}&offset=${offset}`;
    void api<CollectionPage<CollectedLink | CollectedPage>>(base + query, {
      signal: abort.signal,
    })
      .then((data) => {
        if (!abort.signal.aborted) setRows(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [base, view, domain, linkState, offset, state?.lastSeen]);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const source = state?.sources.find((s) => s.domain === domain);
  const running = state?.jobs.find((j) => active(j.status));
  const links = (
    view === "links" ? (rows?.items ?? []) : []
  ) as CollectedLink[];
  const pages = (
    view === "pages" ? (rows?.items ?? []) : []
  ) as CollectedPage[];
  return (
    <div className="seo-page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>
              {view === "links"
                ? "Build your backlink evidence"
                : "Collect competitor pages"}
            </h2>
            <p>
              Collected directly by Audit’s crawler. Every result comes from a
              public page we visited.
            </p>
          </div>
          <Database size={26} />
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {!state && !error && (
          <p role="status">
            <LoaderCircle size={16} className="spin" /> Loading collection…
          </p>
        )}
        <div className="configuration-note">
          {view === "links"
            ? "Backlinks appear when Audit visits an outside page that links to your website. Add relevant directories, partners or other known source websites to grow coverage. Crawling your own site alone cannot discover all incoming links."
            : "Compare page titles, headings and content depth from the websites you collect. Website content does not establish search rankings, traffic or keyword demand; those measurements are not available here."}
        </div>
        <form
          className="research-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api(
                base +
                  (view === "links" ? "/collection/sources" : "/competitors"),
                {
                  method: "POST",
                  body: JSON.stringify(
                    view === "links" ? { url: input } : { domain: input },
                  ),
                },
              );
              setInput("");
            });
          }}
        >
          <label>
            {view === "links"
              ? "Source website or public page"
              : "Competitor website"}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                view === "links"
                  ? "directory.com/your-listing"
                  : "competitor.com"
              }
              maxLength={2048}
              required
            />
          </label>
          <button className="button secondary" disabled={busy}>
            <Plus size={16} />{" "}
            {view === "links" ? "Save source" : "Save competitor"}
          </button>
        </form>
        {view === "pages" && (
          <div className="seo-watchlist">
            {rivals.map((r) => (
              <div key={r.id}>
                <strong>{r.domain}</strong>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${r.domain} from your watchlist? Collected evidence stays saved.`,
                      )
                    )
                      void act(() =>
                        api(base + `/competitors/${r.id}`, {
                          method: "DELETE",
                        }),
                      );
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="seo-toolbar">
          <label>
            Website to collect
            <select
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setOffset(0);
              }}
            >
              {state?.sources.map((s) => (
                <option key={s.domain} value={s.domain}>
                  {s.domain} · {s.kind === "website" ? "Your website" : s.kind}
                </option>
              ))}
            </select>
          </label>
          <label>
            Page limit
            <input
              type="number"
              min={100}
              max={state?.pageLimit ?? 10000}
              step={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !domain || !!running || !project.verifiedAt}
            onClick={() =>
              void act(() =>
                api(base + "/collection/jobs", {
                  method: "POST",
                  body: JSON.stringify({ domain, pageLimit: limit }),
                }),
              )
            }
          >
            <RefreshCw size={16} /> Collect pages
          </button>
        </div>
        {!project.verifiedAt && (
          <p className="seo-caption">
            Verify your own website in Connections before starting research.
            Collection also requires an active subscription.
          </p>
        )}
        <p className="seo-caption">
          {state?.monthlyCrawls ?? 30} crawls per account each month, shared
          with website audits. A crawl can cover up to 10,000 pages. Source
          websites may limit access.
        </p>
        {running && (
          <div className="seo-job" role="status">
            <div>
              <strong>Collecting {running.targetUrl ?? project.url}</strong>
              <span>
                {running.pagesDone.toLocaleString()} pages collected ·{" "}
                {running.discovered.toLocaleString()} discovered ·{" "}
                {running.status}
              </span>
              {running.error && <p>{running.error}</p>}
            </div>
            <progress
              value={running.pagesDone}
              max={running.pageLimit}
              aria-label="Pages collected"
            />
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api(base + `/jobs/${running.id}/cancel`, { method: "POST" }),
                )
              }
            >
              Cancel crawl
            </button>
          </div>
        )}
        <div className="collection-metrics">
          <div>
            <strong>{state?.pages.toLocaleString() ?? "—"}</strong>
            <span>Pages in your collection</span>
          </div>
          <div>
            <strong>{state?.links.toLocaleString() ?? "—"}</strong>
            <span>Incoming links observed</span>
          </div>
          <div>
            <strong>{state?.sources.length ?? "—"}</strong>
            <span>Saved source websites</span>
          </div>
        </div>
        {state && (
          <p className="seo-caption">
            Latest page observation:{" "}
            {state.lastSeen
              ? dateTime(state.lastSeen)
              : "No pages collected yet"}
            . Coverage is limited to pages visited within this project. Counts
            are not web-wide totals.
          </p>
        )}
      </section>
      {view === "links" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>Discover more sources</h2>
              <p>
                Outside websites linked from pages in your collection. Save a
                source to check for incoming links, then revisit it through
                Automation.
              </p>
            </div>
          </div>
          <ResultTable
            rows={state?.candidates ?? []}
            headers={[
              "Suggested source",
              "Found on",
              "Pages mentioning it",
              "Next step",
            ]}
            render={(c) => (
              <tr key={c.domain}>
                <td>
                  <WebLink url={c.url}>{c.domain}</WebLink>
                  <small>Unverified source suggestion</small>
                </td>
                <td>
                  <WebLink url={c.foundOn} />
                </td>
                <td>{c.mentions}</td>
                <td>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        api(base + "/collection/sources", {
                          method: "POST",
                          body: JSON.stringify({ url: c.url }),
                        }),
                      )
                    }
                  >
                    Save source
                  </button>
                </td>
              </tr>
            )}
          />
          <p className="seo-caption">
            Up to 100 suggestions from observed links. A mention does not prove
            this website links back to you. Saved sources join the rotation when
            source monitoring is enabled.
          </p>
        </section>
      )}
      <section className="card">
        <div className="section-head">
          <div>
            <h2>
              {view === "links"
                ? "Incoming links in your collection"
                : `Page evidence${domain ? ` · ${domain}` : ""}`}
            </h2>
            <p>
              {view === "links"
                ? "One record per source page and destination. First seen is when Audit found the link."
                : `${source?.pages ?? 0} pages observed on this website. Titles and headings are content evidence, not ranking keywords.`}
            </p>
          </div>
        </div>
        {view === "links" && (
          <div className="seo-tabs">
            {[
              ["present", "Observed links"],
              ["missing", "Missing on recheck"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={linkState === value ? "selected" : ""}
                aria-pressed={linkState === value}
                onClick={() => {
                  setLinkState(value);
                  setOffset(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="seo-toolbar">
          <CsvButton
            name={
              view === "links"
                ? "audit-observed-backlinks.csv"
                : "audit-collected-pages.csv"
            }
            rows={
              view === "links"
                ? [
                    [
                      "Source",
                      "Destination",
                      "Anchor",
                      "Rel",
                      "First seen",
                      "Last seen",
                      "Last checked",
                      "Present",
                    ],
                    ...links.map((l) => [
                      l.sourceUrl,
                      l.targetUrl,
                      l.anchor,
                      l.rel.join(" "),
                      l.firstSeen,
                      l.lastSeen,
                      l.lastChecked,
                      String(l.present),
                    ]),
                  ]
                : [
                    [
                      "URL",
                      "Title",
                      "Headings",
                      "Words",
                      "Status",
                      "Noindex",
                      "Observed at",
                    ],
                    ...pages.map((p) => [
                      p.url,
                      p.title,
                      p.headings.join(" | "),
                      p.wordCount,
                      p.status,
                      String(p.noindex),
                      p.lastSeen,
                    ]),
                  ]
            }
          />
          <span className="seo-caption">
            Export includes this page of up to 100 results.
          </span>
        </div>
        {loading ? (
          <p role="status">Loading collected evidence…</p>
        ) : view === "links" ? (
          <ResultTable
            pageSize={100}
            rows={links}
            headers={[
              "Source page",
              "Destination",
              "Anchor / rel",
              "First seen",
              "Last checked",
            ]}
            render={(l) => (
              <tr key={l.sourceUrl + l.targetUrl}>
                <td>
                  <WebLink url={l.sourceUrl} />
                </td>
                <td>
                  <WebLink url={l.targetUrl} />
                </td>
                <td>
                  {l.anchor || "No text"}
                  <small>{l.rel.join(", ") || "No rel attribute"}</small>
                </td>
                <td>{dateTime(l.firstSeen)}</td>
                <td>{dateTime(l.lastChecked)}</td>
              </tr>
            )}
          />
        ) : (
          <ResultTable
            pageSize={100}
            rows={pages}
            headers={[
              "Page",
              "Title and headings",
              "Words",
              "Status",
              "Observed",
            ]}
            render={(p) => (
              <tr key={p.url}>
                <td>
                  <WebLink url={p.url} />
                </td>
                <td>
                  {p.title || "No title"}
                  <small>{p.headings.join(" · ") || "No H1 heading"}</small>
                </td>
                <td>{p.wordCount.toLocaleString()}</td>
                <td>
                  {p.status}
                  {p.noindex && " · noindex"}
                </td>
                <td>{dateTime(p.lastSeen)}</td>
              </tr>
            )}
          />
        )}
        {rows && (
          <div className="seo-toolbar">
            <button
              className="button secondary"
              disabled={!offset || loading}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            >
              Previous results
            </button>
            <span>
              {rows.total.toLocaleString()} collected results
              {rows.total
                ? ` · ${offset + 1}–${offset + rows.items.length}`
                : ""}
            </span>
            <button
              className="button secondary"
              disabled={rows.next === null || loading}
              onClick={() => setOffset(rows.next!)}
            >
              Next results
            </button>
          </div>
        )}
        <p className="seo-caption">
          A missing result does not prove a page or link does not exist. Blocked
          pages, failed requests and unvisited pages remain unknown. HTML
          collection does not execute page JavaScript.
        </p>
      </section>
      {!!state?.jobs.length && (
        <section className="card">
          <h2>Recent collection activity</h2>
          <ResultTable
            rows={state.jobs}
            headers={["Website", "Status", "Pages", "Started"]}
            render={(j) => (
              <tr key={j.id}>
                <td>{j.targetUrl ?? project.url}</td>
                <td>
                  {j.status}
                  {j.status === "partial" && (
                    <small>Some pages remain unvisited or were skipped.</small>
                  )}
                  {j.error && <small>{j.error}</small>}
                </td>
                <td>
                  {j.pagesDone.toLocaleString()} /{" "}
                  {j.pageLimit.toLocaleString()}
                </td>
                <td>{dateTime(j.createdAt)}</td>
              </tr>
            )}
          />
        </section>
      )}
    </div>
  );
}
