import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { api, type Project } from "./api";
import {
  searchCountries,
  type TrackedKeyword,
  type RankObservation,
  type SearchPosition,
  type Device,
} from "./seo-types";
import {
  useResearch,
  ResearchStatus,
  RefreshResearch,
  metric,
  dateTime,
  ResultTable,
  WebLink,
  CsvButton,
} from "./seo-ui";

export default function RankTracking({ project }: { project: Project }) {
  const state = useResearch(project, "ranks");
  const [keywords, setKeywords] = useState<TrackedKeyword[]>([]);
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("United States");
  const [device, setDevice] = useState<Device>("desktop");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<TrackedKeyword>();
  const [history, setHistory] = useState<SearchPosition[]>([]);
  const [legacy, setLegacy] = useState<RankObservation[]>([]);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void api<TrackedKeyword[]>(state.base + "/keywords", {
      signal: abort.signal,
    })
      .then(setKeywords)
      .catch((e) => {
        if (!abort.signal.aborted) state.setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [state.base, state.job?.updatedAt]);
  useEffect(() => {
    setHistory([]);
    setLegacy([]);
    if (!selected) return;
    const abort = new AbortController();
    setHistoryLoading(true);
    void Promise.all([
      api<SearchPosition[]>(`${state.base}/keywords/${selected.id}/positions`, {
        signal: abort.signal,
      }),
      api<RankObservation[]>(`${state.base}/keywords/${selected.id}/history`, {
        signal: abort.signal,
      }),
    ])
      .then(([positions, snapshots]) => {
        if (!abort.signal.aborted) {
          setHistory(positions);
          setLegacy(snapshots);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) state.setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setHistoryLoading(false);
      });
    return () => abort.abort();
  }, [state.base, selected?.id, state.job?.updatedAt]);
  async function act(work: () => Promise<TrackedKeyword[]>, message: string) {
    setBusy(true);
    state.setError("");
    setNotice("");
    try {
      setKeywords(await work());
      setNotice(message);
    } catch (e) {
      state.setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = keywords.filter((k) =>
    k.keyword.toLowerCase().includes(filter.toLowerCase()),
  );
  const measured = keywords.filter(
    (k) => k.active && k.positions[0]?.position != null,
  );
  const change = (k: TrackedKeyword) => {
    const [a, b] = k.positions;
    if (a?.position == null || b?.position == null) return "—";
    const delta = b.position - a.position;
    return delta > 0
      ? `↑ ${metric(delta)}`
      : delta < 0
        ? `↓ ${metric(-delta)}`
        : "No change";
  };
  return (
    <div className="seo-page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Monitor the searches that matter</h2>
            <p>
              Daily average positions from your connected Google Search Console
              property, by country and device.
            </p>
          </div>
          <RefreshResearch
            state={state}
            project={project}
            label="Refresh positions"
          />
        </div>
        <div className="configuration-note">
          These are average positions across actual search impressions, not a
          live search-result snapshot. Google can omit low-volume queries and
          days with no reported data. A blank position does not mean your
          website is unranked.
        </div>
        <form
          className="seo-keyword-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const result = await api<TrackedKeyword[]>(
                state.base + "/keywords",
                {
                  method: "POST",
                  body: JSON.stringify({ keyword, country, device }),
                },
              );
              setKeyword("");
              return result;
            }, "Keyword saved for the next daily refresh. Enable recurring rank tracking in Automation.");
          }}
        >
          <label>
            Keyword
            <input
              required
              maxLength={200}
              placeholder="e.g. garden design Indianapolis"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
          <label>
            Search country
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {searchCountries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Device
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value as Device)}
            >
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <button className="button secondary" disabled={busy}>
            <Plus size={16} /> Add keyword
          </button>
        </form>
        {notice && (
          <p className="success-banner" role="status">
            {notice}
          </p>
        )}
        <ResearchStatus state={state} project={project} />
        <div className="seo-stats">
          <div>
            <span>Active keywords</span>
            <strong>{keywords.filter((k) => k.active).length} / 50</strong>
          </div>
          <div>
            <span>Latest day has a position</span>
            <strong>{measured.length}</strong>
          </div>
          <div>
            <span>Latest average position ≤ 10</span>
            <strong>
              {measured.length
                ? measured.filter((k) => k.positions[0].position! <= 10).length
                : "No data"}
            </strong>
          </div>
        </div>
        <div className="seo-toolbar">
          <label>
            Find a tracked keyword
            <input
              type="search"
              placeholder="Search your keywords"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <CsvButton
            name="audit-position-monitoring.csv"
            rows={[
              [
                "Keyword",
                "Country",
                "Device",
                "Reporting day (Pacific)",
                "Average position",
                "Previous day average",
                "Clicks",
                "Impressions",
                "Source",
              ],
              ...rows.map((k) => [
                k.keyword,
                k.country,
                k.device,
                k.positions[0]?.day,
                k.positions[0]?.position,
                k.positions[1]?.position,
                k.positions[0]?.clicks,
                k.positions[0]?.impressions,
                "Google Search Console",
              ]),
            ]}
          />
        </div>
        {loading ? (
          <p role="status">Loading your keywords…</p>
        ) : (
          <ResultTable
            rows={rows}
            headers={[
              "Keyword",
              "Country / device",
              "Average position",
              "Daily change",
              "Reporting day",
              "Actions",
            ]}
            render={(k) => (
              <tr key={k.id}>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setSelected(k)}
                  >
                    {k.keyword}
                  </button>
                  <small>{k.active ? "Tracking enabled" : "Paused"}</small>
                </td>
                <td>
                  {k.country}
                  <small>{k.device}</small>
                </td>
                <td>
                  {k.positions[0]?.position != null
                    ? metric(k.positions[0].position)
                    : "Not reported"}
                </td>
                <td>{change(k)}</td>
                <td>{k.positions[0]?.day ?? "Awaiting refresh"}</td>
                <td>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          api(`${state.base}/keywords/${k.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !k.active }),
                          }),
                        k.active
                          ? "Keyword paused. History is retained."
                          : "Keyword resumed.",
                      )
                    }
                  >
                    {k.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove “${k.keyword}” and its saved history?`,
                        )
                      )
                        void act(async () => {
                          const result = await api<TrackedKeyword[]>(
                            `${state.base}/keywords/${k.id}`,
                            { method: "DELETE" },
                          );
                          if (selected?.id === k.id) setSelected(undefined);
                          return result;
                        }, "Keyword removed.");
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            )}
          />
        )}
      </section>
      {selected && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{selected.keyword}</h2>
              <p>
                {selected.country} · {selected.device} · Last 90 reporting days
                available
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => setSelected(undefined)}
            >
              Close history
            </button>
          </div>
          <p className="seo-caption">
            Reporting dates follow Google’s Pacific time zone. Positions are
            averages for the connected property. Lower is better; missing days
            stay unknown.
          </p>
          {historyLoading ? (
            <p role="status">Loading position history…</p>
          ) : (
            <ResultTable
              rows={history}
              headers={[
                "Reporting day",
                "Average position",
                "Clicks",
                "Impressions",
                "Collected",
              ]}
              render={(r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>
                    {r.position == null ? "Not reported" : metric(r.position)}
                  </td>
                  <td>{metric(r.clicks)}</td>
                  <td>{metric(r.impressions)}</td>
                  <td>{dateTime(r.checkedAt)}</td>
                </tr>
              )}
            />
          )}
          {!!legacy.length && (
            <details>
              <summary>Earlier search-result snapshots</summary>
              <p>
                Historical snapshots use a different measurement and are kept
                separate from average positions.
              </p>
              <ResultTable
                rows={legacy}
                headers={[
                  "Day",
                  "Snapshot position",
                  "Page",
                  "Competitor positions",
                ]}
                render={(r) => (
                  <tr key={r.id}>
                    <td>{r.day}</td>
                    <td>{metric(r.position)}</td>
                    <td>
                      <WebLink url={r.url} />
                    </td>
                    <td>
                      {r.competitors
                        .map((c) => `${c.domain}: ${metric(c.position)}`)
                        .join(" · ")}
                    </td>
                  </tr>
                )}
              />
            </details>
          )}
        </section>
      )}
    </div>
  );
}
