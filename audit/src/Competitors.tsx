import { useEffect, useState } from "react";
import { Plus, Target } from "lucide-react";
import { api, type Project } from "./api";
import {
  searchCountries,
  type Competitor,
  type Discovery,
  type DomainOverview,
  type RankedKeywords,
  type KeywordIntersection,
  type CompetitorPages,
} from "./seo-types";
import {
  useResearch,
  ResearchStatus,
  RefreshResearch,
  metric,
  part,
  ResultTable,
  WebLink,
  CsvButton,
  dateTime,
} from "./seo-ui";
export default function Competitors({ project }: { project: Project }) {
  const state = useResearch(project, "competitor"),
    discovery = useResearch(project, "discover");
  const [watchlist, setWatchlist] = useState<Competitor[]>([]);
  const [website, setWebsite] = useState("");
  const [selected, setSelected] = useState("");
  const [country, setCountry] = useState("United States");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("missing");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    void api<Competitor[]>(state.base + "/competitors")
      .then((rows) => {
        setWatchlist(rows);
        setSelected(rows[0]?.domain ?? "");
      })
      .catch((e) => state.setError(e.message));
  }, [state.base]);
  async function save(domain: string) {
    setBusy(true);
    state.setError("");
    try {
      const rows = await api<Competitor[]>(state.base + "/competitors", {
        method: "POST",
        body: JSON.stringify({ domain }),
      });
      setWatchlist(rows);
      setWebsite("");
      setSelected(rows.at(-1)?.domain ?? "");
      setNotice("Competitor saved to your watchlist.");
    } catch (e) {
      state.setError(
        e instanceof Error ? e.message : "Could not save competitor.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(c: Competitor) {
    setBusy(true);
    try {
      const rows = await api<Competitor[]>(
        `${state.base}/competitors/${c.id}`,
        { method: "DELETE" },
      );
      setWatchlist(rows);
      if (selected === c.domain) setSelected(rows[0]?.domain ?? "");
    } catch (e) {
      state.setError(
        e instanceof Error ? e.message : "Could not remove competitor.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function track(keyword: string) {
    setBusy(true);
    state.setError("");
    try {
      await api(state.base + "/keywords", {
        method: "POST",
        body: JSON.stringify({
          keyword,
          country: state.job?.params.country ?? country,
          device: "desktop",
        }),
      });
      setNotice(
        `“${keyword}” saved in Rank tracking for ${state.job?.params.country ?? country}, desktop.`,
      );
    } catch (e) {
      state.setError(e instanceof Error ? e.message : "Could not add keyword.");
    } finally {
      setBusy(false);
    }
  }
  const found = part<Discovery>(discovery.job, "discover"),
    own = part<DomainOverview>(state.job, "own"),
    rival = part<DomainOverview>(state.job, "rival"),
    pages = part<CompetitorPages>(state.job, "pages"),
    ranked = part<RankedKeywords>(state.job, "keywords");
  const gaps = part<KeywordIntersection>(
    state.job,
    tab === "missing" ? "missing" : "shared",
  );
  const keywordRows =
    tab === "keywords"
      ? (ranked?.items ?? []).map((k) => ({
          ...k,
          competitorPosition: k.position,
          ownPosition: null,
        }))
      : (gaps?.items ?? []).filter(
          (k) =>
            tab !== "weak" ||
            (k.ownPosition !== null &&
              k.competitorPosition !== null &&
              k.ownPosition > k.competitorPosition),
        );
  const filteredKeywords = keywordRows.filter((k) =>
    k.keyword.toLowerCase().includes(filter.toLowerCase()),
  );
  const filteredPages = (pages?.items ?? []).filter((p) =>
    p.url.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="seo-page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Your competitor watchlist</h2>
            <p>
              Save up to five websites. Compare their search presence and find
              useful opportunities for your own pages.
            </p>
          </div>
          <Target size={26} />
        </div>
        <form
          className="research-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(website);
          }}
        >
          <label>
            Competitor website
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="competitor.com"
              maxLength={2048}
              required
            />
          </label>
          <button className="button secondary" disabled={busy}>
            <Plus size={16} /> Save competitor
          </button>
        </form>
        {notice && (
          <p className="success-banner" role="status">
            {notice}
          </p>
        )}
        <div className="seo-watchlist">
          {watchlist.map((c) => (
            <div key={c.id}>
              <strong>{c.domain}</strong>
              <button
                className="text-button"
                disabled={busy}
                aria-label={`Remove ${c.domain}`}
                onClick={() => void remove(c)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {!watchlist.length && (
          <p className="seo-caption">
            Add a business you compete with, or discover websites below that
            appear for similar searches.
          </p>
        )}
        <div className="seo-toolbar">
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
            Compare with
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Choose a saved competitor</option>
              {watchlist.map((c) => (
                <option key={c.id}>{c.domain}</option>
              ))}
            </select>
          </label>
          {selected && (
            <RefreshResearch
              state={state}
              project={project}
              label="Research competitor"
              params={{ country, competitor: selected }}
            />
          )}
        </div>
        <ResearchStatus state={state} project={project} />
      </section>
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Discover search competitors</h2>
            <p>
              Websites with overlapping organic keywords in the provider’s
              index.
            </p>
          </div>
          <RefreshResearch
            state={discovery}
            project={project}
            label="Discover competitors"
            params={{ country }}
          />
        </div>
        <ResearchStatus state={discovery} project={project} />
        {found && (
          <>
            <p className="seo-caption">
              {discovery.job?.params.country} · English ·{" "}
              {dateTime(discovery.job!.createdAt)} · up to 20 results
            </p>
            <ResultTable
              rows={found.items}
              headers={[
                "Website",
                "Shared keywords",
                "Est. monthly organic visits",
                "Watchlist",
              ]}
              render={(c) => (
                <tr key={c.domain}>
                  <td>{c.domain}</td>
                  <td>{metric(c.sharedKeywords)}</td>
                  <td>{metric(c.estimatedVisits)}</td>
                  <td>
                    <button
                      className="text-button"
                      disabled={
                        busy || watchlist.some((w) => w.domain === c.domain)
                      }
                      onClick={() => void save(c.domain)}
                    >
                      {watchlist.some((w) => w.domain === c.domain)
                        ? "Saved"
                        : "Add competitor"}
                    </button>
                  </td>
                </tr>
              )}
            />
          </>
        )}
      </section>
      {state.job && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{state.job.params.competitor} compared with your website</h2>
              <p>
                {state.job.params.country} · English · Collected{" "}
                {dateTime(state.job.createdAt)}
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Organic visibility</th>
                  <th>Your website</th>
                  <th>{state.job.params.competitor}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Keywords in provider index</td>
                  <td>{metric(own?.keywords)}</td>
                  <td>{metric(rival?.keywords)}</td>
                </tr>
                <tr>
                  <td>Estimated monthly visits</td>
                  <td>{metric(own?.estimatedVisits)}</td>
                  <td>{metric(rival?.estimatedVisits)}</td>
                </tr>
                <tr>
                  <td>Keywords in top 10</td>
                  <td>{metric(own?.top10)}</td>
                  <td>{metric(rival?.top10)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="seo-tabs" aria-label="Competitor research views">
            {[
              ["missing", "Missing keywords"],
              ["weak", "Weaker rankings"],
              ["shared", "Shared keywords"],
              ["keywords", "Top keywords"],
              ["pages", "Strongest pages"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                className={tab === id ? "selected" : ""}
                onClick={() => {
                  setTab(id);
                  setFilter("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="seo-caption">
            {tab === "missing"
              ? "Competitor keywords for which your domain is absent in this dataset."
              : tab === "weak"
                ? "Shared keywords in this sample where the competitor ranks above your website."
                : tab === "pages"
                  ? "Up to 50 pages ordered by estimated organic visits."
                  : "Up to 100 keywords ordered by estimated monthly search volume."}
          </p>
          <div className="seo-toolbar">
            <label>
              Filter this report
              <input
                type="search"
                placeholder={
                  tab === "pages" ? "Search page URL" : "Search keyword"
                }
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <CsvButton
              name={`audit-competitor-${tab}.csv`}
              rows={
                tab === "pages"
                  ? [
                      [
                        "Page",
                        "Keywords",
                        "Estimated monthly visits",
                        "Top 10 keywords",
                      ],
                      ...filteredPages.map((p) => [
                        p.url,
                        p.keywords,
                        p.estimatedVisits,
                        p.top10,
                      ]),
                    ]
                  : [
                      [
                        "Keyword",
                        "Est. monthly searches",
                        "Difficulty / 100",
                        "Competitor position",
                        "Your position",
                        "Competitor URL",
                        "Provider updated at",
                      ],
                      ...filteredKeywords.map((k) => [
                        k.keyword,
                        k.volume,
                        k.difficulty,
                        k.competitorPosition,
                        k.ownPosition,
                        k.url,
                        k.updatedAt,
                      ]),
                    ]
              }
            />
          </div>
          {tab === "pages" ? (
            <ResultTable
              rows={filteredPages}
              headers={[
                "Page",
                "Keywords",
                "Est. monthly visits",
                "Top 10 keywords",
              ]}
              render={(p) => (
                <tr key={p.url}>
                  <td>
                    <WebLink url={p.url} />
                  </td>
                  <td>{metric(p.keywords)}</td>
                  <td>{metric(p.estimatedVisits)}</td>
                  <td>{metric(p.top10)}</td>
                </tr>
              )}
            />
          ) : (
            <ResultTable
              rows={filteredKeywords}
              headers={[
                "Keyword",
                "Est. searches / month",
                "Difficulty / 100",
                "Competitor",
                "Your position",
                "Track",
              ]}
              render={(k, i) => (
                <tr key={k.keyword + i}>
                  <td>
                    {k.keyword}
                    {k.url && (
                      <small>
                        <WebLink url={k.url}>Ranking page</WebLink>
                      </small>
                    )}
                  </td>
                  <td>{metric(k.volume)}</td>
                  <td>{metric(k.difficulty)}</td>
                  <td>{k.competitorPosition ?? "Unavailable"}</td>
                  <td>
                    {tab === "keywords"
                      ? "Not compared"
                      : (k.ownPosition ??
                        (tab === "missing" ? "Not in dataset" : "Unavailable"))}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void track(k.keyword)}
                    >
                      Track keyword
                    </button>
                  </td>
                </tr>
              )}
            />
          )}
          <p className="seo-caption">
            {tab === "pages"
              ? `${pages?.items.length ?? 0} sampled pages from ${metric(pages?.total)} matches.`
              : `${keywordRows.length} sampled keywords${tab === "weak" ? " meeting the weaker-ranking filter" : ""}.`}{" "}
            Use Rank tracking for fresh, device-specific checks. Keyword lists
            and traffic estimates come from the provider’s research index and
            are not live analytics.
          </p>
        </section>
      )}
      <div className="scope-note">
        <p>
          Source: DataForSEO. Estimates reflect the selected country and the
          provider’s index coverage and update cycle. Missing keywords are
          opportunities to investigate, not proof your website never ranks.
          Research requests reuse the same day’s saved results (UTC). Google
          connections supply your own analytics; this research needs Zoomi’s
          separate licensed data connection.
        </p>
      </div>
    </div>
  );
}
