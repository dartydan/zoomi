import { useEffect, useState } from "react";
import { LoaderCircle, Search, Target } from "lucide-react";
import { api, type Project } from "./api";
interface Gap {
  competitor: string;
  website: string;
  country: string;
  source: string;
  retrievedAt: string;
  total: number;
  items: {
    keyword: string;
    volume: number | null;
    difficulty: number | null;
    updatedAt: string | null;
    competitorPosition: number | null;
  }[];
}
export default function Competitors({ project }: { project: Project }) {
  const base = `/api/projects/${project.id}/research`;
  const [configured, setConfigured] = useState(false);
  const [competitor, setCompetitor] = useState("");
  const [country, setCountry] = useState("United States");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Gap>();
  useEffect(() => {
    void api<{ configured: boolean; reports: Gap[] }>(base)
      .then((r) => {
        setConfigured(r.configured);
        setResult(r.reports[0]);
      })
      .catch((e) => setError(e.message));
  }, [base]);
  async function compare(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setResult(
        await api<Gap>(`${base}/keyword-gap`, {
          method: "POST",
          body: JSON.stringify({ competitor, country }),
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not compare these websites.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Find the searches you’re missing</h2>
          <p>
            Keywords found for another website but not yours in the provider’s
            organic search index.
          </p>
        </div>
        <Target size={25} />
      </div>
      <form className="research-form" onSubmit={compare}>
        <label>
          Competitor website
          <input
            required
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
            placeholder="competitor.com"
          />
        </label>
        <label>
          Search region
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {["United States", "United Kingdom", "Canada", "Australia"].map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <button className="button primary" disabled={!configured || busy}>
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Search size={17} />
          )}
          Find keyword gaps
        </button>
      </form>
      {!configured && (
        <div className="configuration-note">
          Competitor research is awaiting Zoomi’s licensed search-data
          connection. This feature uses external search data; connecting Google
          alone does not provide competitors’ keywords.
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {result ? (
        <>
          <div className="section-head">
            <h2>
              {result.competitor} compared with {result.website}
            </h2>
            <span className="pill sage">{result.country} · English</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Est. monthly searches</th>
                  <th>Difficulty / 100</th>
                  <th>Competitor position</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((i) => (
                  <tr key={i.keyword}>
                    <td>{i.keyword}</td>
                    <td>{i.volume?.toLocaleString() ?? "Unavailable"}</td>
                    <td>{i.difficulty ?? "Unavailable"}</td>
                    <td>{i.competitorPosition ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.items.length && (
            <div className="empty">
              <h3>No keyword gaps returned.</h3>
              <p>
                This may mean there is no matching data in this provider’s
                index.
              </p>
            </div>
          )}
          <div className="scope-note">
            <p>
              Source: {result.source}. Retrieved{" "}
              {new Date(result.retrievedAt).toLocaleString()}. Showing up to 100
              of {result.total.toLocaleString()} results. Search volume and
              difficulty are provider estimates. An absent keyword means it
              wasn’t found in this dataset, not proof your site never ranks for
              it.
            </p>
          </div>
        </>
      ) : (
        <div className="empty">
          <Target size={30} />
          <h3>Find your next content opportunity.</h3>
          <p>
            Compare a relevant competitor to discover searches your website
            could address. Results are saved privately in your account.
          </p>
        </div>
      )}
    </section>
  );
}
