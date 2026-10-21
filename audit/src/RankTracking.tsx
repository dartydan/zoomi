import { useEffect, useState } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { api, type Project } from "./api";
import {
  searchCountries,
  type TrackedKeyword,
  type RankObservation,
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
  const [history, setHistory] = useState<RankObservation[]>([]);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function load() {
    const rows = await api<TrackedKeyword[]>(state.base + "/keywords");
    setKeywords(rows);
    setLoaded(true);
  }
  useEffect(() => {
    void load().catch((e) => state.setError(e.message));
  }, [state.base, state.job?.updatedAt]);
  useEffect(() => {
    setHistory([]);
    if (!selected) return;
    let mounted = true;
    void api<RankObservation[]>(`${state.base}/keywords/${selected.id}/history`)
      .then((r) => {
        if (mounted) setHistory(r);
      })
      .catch((e) => {
        if (mounted) state.setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, [state.base, selected?.id, state.job?.updatedAt]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    state.setError("");
    setNotice("");
    try {
      setKeywords(
        await api(state.base + "/keywords", {
          method: "POST",
          body: JSON.stringify({ keyword, country, device }),
        }),
      );
      setKeyword("");
      setNotice("Keyword saved. It will be included in your next rank check.");
    } catch (e) {
      state.setError(
        e instanceof Error ? e.message : "Could not save keyword.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function change(k: TrackedKeyword, remove = false) {
    if (
      remove &&
      !window.confirm(`Remove “${k.keyword}” and its saved ranking history?`)
    )
      return;
    setBusy(true);
    state.setError("");
    try {
      setKeywords(
        await api(`${state.base}/keywords/${k.id}`, {
          method: remove ? "DELETE" : "PATCH",
          ...(!remove ? { body: JSON.stringify({ active: !k.active }) } : {}),
        }),
      );
      if (remove && selected?.id === k.id) setSelected(undefined);
      setNotice(
        remove
          ? "Keyword and history removed."
          : k.active
            ? "Keyword paused. Its history is retained."
            : "Keyword resumed for future checks.",
      );
    } catch (e) {
      state.setError(
        e instanceof Error ? e.message : "Could not update keyword.",
      );
    } finally {
      setBusy(false);
    }
  }
  const rows = keywords.filter((k) =>
    k.keyword.toLowerCase().includes(filter.toLowerCase()),
  );
  const ranked = keywords.filter(
    (k) =>
      k.active &&
      k.latest?.position !== null &&
      k.latest?.position !== undefined,
  );
  const top10 = ranked.filter((k) => k.latest!.position! <= 10).length;
  const changeText = (k: TrackedKeyword) => {
    const a = k.latest?.position,
      b = k.previous?.position;
    if (a == null || b == null) return "—";
    const d = b - a;
    return d > 0 ? `↑ ${d}` : d < 0 ? `↓ ${Math.abs(d)}` : "No change";
  };
  return (
    <div className="seo-page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>The searches that matter to you</h2>
            <p>
              Track up to 50 keyword, country and device combinations. Google
              organic results, including your website’s subdomains.
            </p>
          </div>
          <RefreshResearch
            state={state}
            project={project}
            label="Check active keywords"
          />
        </div>
        <form className="seo-keyword-form" onSubmit={add}>
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
            <span>With saved checks</span>
            <strong>
              {keywords.filter((k) => k.active && k.latest).length}
            </strong>
          </div>
          <div>
            <span>Latest positions in top 10</span>
            <strong>
              {keywords.some((k) => k.active && k.latest)
                ? top10
                : "Not checked"}
            </strong>
          </div>
        </div>
        <div className="seo-toolbar">
          <label>
            Find a tracked keyword
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search your keywords"
            />
          </label>
          <CsvButton
            name="audit-keyword-ranks.csv"
            rows={[
              [
                "Keyword",
                "Country",
                "Device",
                "Active",
                "Position",
                "Previous position",
                "Checked at",
                "URL",
                "Organic results returned",
              ],
              ...rows.map((k) => [
                k.keyword,
                k.country,
                k.device,
                k.active,
                k.latest?.position,
                k.previous?.position,
                k.latest?.checkedAt,
                k.latest?.url,
                k.latest?.organicResults,
              ]),
            ]}
          />
        </div>
        <ResultTable
          rows={rows}
          headers={[
            "Keyword",
            "Country / device",
            "Position",
            "Movement",
            "Checked",
            "Manage",
          ]}
          empty={
            loaded
              ? keywords.length
                ? "No keywords match your search."
                : "Add your first keyword to start building a ranking history."
              : "Loading your keywords…"
          }
          render={(k) => (
            <tr key={k.id}>
              <td>
                <button className="text-button" onClick={() => setSelected(k)}>
                  {k.keyword}
                </button>
                {!k.active && <small>Paused</small>}
              </td>
              <td>
                {k.country}
                <small>{k.device} · English</small>
              </td>
              <td>
                {k.latest ? (k.latest.position ?? "Not found") : "Not checked"}
                {k.latest && (
                  <small>
                    {k.latest.organicResults} organic results returned
                  </small>
                )}
              </td>
              <td>{changeText(k)}</td>
              <td>{k.latest ? dateTime(k.latest.checkedAt) : "—"}</td>
              <td>
                <div className="seo-inline">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void change(k)}
                  >
                    {k.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void change(k, true)}
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          )}
        />
        <p className="seo-caption">
          English searches. Results vary by location, device and time. “Not
          found” means absent from the returned organic results; it does not
          imply a position beyond 100. Refreshes reuse that day’s saved checks
          (UTC). Movement compares the two most recent successful checks.
        </p>
      </section>
      {selected && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{selected.keyword}</h2>
              <p>
                {selected.country} · {selected.device} · Up to 90 saved checks
              </p>
            </div>
            <TrendingUp size={25} />
          </div>
          {history.length > 1 && (
            <div
              className="rank-timeline"
              aria-label="Ranking history; lower position is better"
            >
              {[...history]
                .reverse()
                .slice(-20)
                .map((r) => (
                  <div
                    key={r.id}
                    title={`${r.day}: ${r.position ?? "Not found"}`}
                  >
                    <strong>{r.position ?? "—"}</strong>
                    <div className="rank-track">
                      <span
                        style={{
                          height: r.position
                            ? `${Math.max(4, 100 - Math.min(100, r.position))}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <small>{r.day.slice(5)}</small>
                  </div>
                ))}
            </div>
          )}
          <ResultTable
            rows={history}
            headers={["Checked", "Position", "Your page", "Coverage"]}
            empty="Your first successful check will appear here."
            render={(r) => (
              <tr key={r.id}>
                <td>{dateTime(r.checkedAt)}</td>
                <td>{r.position ?? "Not found"}</td>
                <td>
                  <WebLink url={r.url} />
                </td>
                <td>
                  {r.organicResults} organic results
                  <small>
                    Deepest returned position:{" "}
                    {r.deepestPosition || "Unavailable"}
                  </small>
                </td>
              </tr>
            )}
          />
          {history[0]?.competitors.length > 0 && (
            <>
              <h3>Competitors in the latest check</h3>
              <ResultTable
                rows={history[0].competitors}
                headers={["Competitor", "Position", "Ranking page"]}
                render={(c) => (
                  <tr key={c.domain}>
                    <td>{c.domain}</td>
                    <td>{c.position ?? "Not found"}</td>
                    <td>
                      <WebLink url={c.url} />
                    </td>
                  </tr>
                )}
              />
            </>
          )}
          {history[0]?.leadingResults.length > 0 && (
            <>
              <h3>Leading organic results</h3>
              <ResultTable
                rows={history[0].leadingResults}
                headers={["Position", "Page"]}
                render={(r) => (
                  <tr key={r.position + "-" + r.url}>
                    <td>{r.position}</td>
                    <td>
                      <WebLink url={r.url}>{r.title || r.url}</WebLink>
                    </td>
                  </tr>
                )}
              />
            </>
          )}
        </section>
      )}
      <div className="scope-note">
        <p>
          Set automatic checks in Automation. Pausing a keyword stops future
          checks; its history stays here. A check already in progress uses the
          keyword list it started with.
        </p>
      </div>
    </div>
  );
}
