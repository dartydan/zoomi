import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { api, type Project } from "./api";
import type {
  BacklinkSummary,
  Backlinks as LinkResults,
  ReferringDomains,
  SeoJob,
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
export default function Backlinks({ project }: { project: Project }) {
  const state = useResearch(project, "backlinks");
  const [tab, setTab] = useState("links");
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState("all");
  const [previous, setPrevious] = useState<SeoJob>();
  const summary = part<BacklinkSummary>(state.job, "summary"),
    links = part<LinkResults>(state.job, tab === "lost" ? "lost" : "links"),
    domains = part<ReferringDomains>(state.job, "domains");
  useEffect(() => {
    setPrevious(undefined);
    let mounted = true;
    const prior = state.reports.find(
      (r) =>
        r.status === "complete" && r.createdAt < (state.job?.createdAt ?? ""),
    );
    if (prior)
      void api<SeoJob>(`${state.base}/seo/jobs/${prior.id}`)
        .then((r) => {
          if (mounted) setPrevious(r);
        })
        .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [state.job?.id, state.reports, state.base]);
  const old = part<BacklinkSummary>(previous, "summary");
  const delta = (key: "backlinks" | "referringDomains") => {
    const a = summary?.[key],
      b = old?.[key];
    if (a == null || b == null) return null;
    const d = a - b;
    return `${d > 0 ? "+" : ""}${d.toLocaleString()} net since ${new Date(previous!.createdAt).toLocaleDateString()}`;
  };
  const visible = (links?.items ?? []).filter(
    (l) =>
      `${l.from} ${l.to ?? ""} ${l.anchor ?? ""}`
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (follow === "all" ||
        (follow === "follow" ? l.dofollow === true : l.dofollow === false)),
  );
  const visibleDomains = (domains?.items ?? []).filter((d) =>
    d.domain.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div className="seo-page">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Who’s linking to your website?</h2>
            <p>
              Understand your link profile, discover referring websites, and
              review links the provider reports as lost.
            </p>
          </div>
          <RefreshResearch state={state} project={project} backlinks />
        </div>
        <ResearchStatus state={state} project={project} backlinks />
        {!state.job && (
          <div className="empty">
            <Link2 size={30} />
            <h3>Your link profile starts here</h3>
            <p>
              A fresh check saves your totals, up to 100 live links, 100
              referring websites and 100 lost links. Reports are private to your
              account.
            </p>
          </div>
        )}
        {state.job && (
          <>
            <div className="seo-stats">
              <div>
                <span>Live backlinks</span>
                <strong>{metric(summary?.backlinks)}</strong>
                <small>{delta("backlinks")}</small>
              </div>
              <div>
                <span>Referring domains</span>
                <strong>{metric(summary?.referringDomains)}</strong>
                <small>{delta("referringDomains")}</small>
              </div>
              <div>
                <span>Broken backlinks</span>
                <strong>{metric(summary?.brokenBacklinks)}</strong>
              </div>
              <div>
                <span>DataForSEO rank / 100</span>
                <strong>{metric(summary?.rank)}</strong>
              </div>
            </div>
            {!!summary?.brokenBacklinks && (
              <div className="configuration-note">
                <strong>Review broken links.</strong> Check the destination
                pages and redirect outdated URLs when there is a relevant
                replacement. This total comes from the provider’s index; it may
                exceed the sampled rows below.
              </div>
            )}
            <div className="seo-tabs" aria-label="Backlink views">
              {[
                ["links", "Live backlinks"],
                ["domains", "Referring websites"],
                ["lost", "Lost backlinks"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  aria-pressed={tab === id}
                  onClick={() => {
                    setTab(id);
                    setFilter("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="seo-toolbar">
              <label>
                Search this list
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={
                    tab === "domains"
                      ? "Filter referring websites"
                      : "Filter page or anchor text"
                  }
                />
              </label>
              {tab !== "domains" && (
                <label>
                  Link type
                  <select
                    value={follow}
                    onChange={(e) => setFollow(e.target.value)}
                  >
                    <option value="all">All links</option>
                    <option value="follow">Follow</option>
                    <option value="nofollow">Nofollow</option>
                  </select>
                </label>
              )}
              <CsvButton
                name={`audit-backlinks-${tab}.csv`}
                rows={
                  tab === "domains"
                    ? [
                        [
                          "Domain",
                          "Backlinks",
                          "DataForSEO rank / 100",
                          "First seen",
                        ],
                        ...visibleDomains.map((d) => [
                          d.domain,
                          d.backlinks,
                          d.rank,
                          d.firstSeen,
                        ]),
                      ]
                    : [
                        [
                          "Source URL",
                          "Target URL",
                          "Anchor",
                          "Follow",
                          "Lost",
                          "Broken",
                          "DataForSEO rank / 100",
                          "First seen",
                          "Last seen",
                        ],
                        ...visible.map((l) => [
                          l.from,
                          l.to,
                          l.anchor,
                          l.dofollow,
                          l.lost,
                          l.broken,
                          l.rank,
                          l.firstSeen,
                          l.lastSeen,
                        ]),
                      ]
                }
              />
            </div>
            {tab === "domains" ? (
              <ResultTable
                rows={visibleDomains}
                headers={[
                  "Referring website",
                  "Backlinks",
                  "Rank / 100",
                  "First seen",
                ]}
                render={(d) => (
                  <tr key={d.domain}>
                    <td>
                      <WebLink url={"https://" + d.domain}>{d.domain}</WebLink>
                    </td>
                    <td>{metric(d.backlinks)}</td>
                    <td>{metric(d.rank)}</td>
                    <td>{d.firstSeen ?? "Unavailable"}</td>
                  </tr>
                )}
              />
            ) : (
              <ResultTable
                rows={visible}
                headers={[
                  "Linking page",
                  "Destination / anchor",
                  "Link type",
                  "Rank / 100",
                  "Last seen",
                ]}
                render={(l, i) => (
                  <tr key={l.from + i}>
                    <td>
                      <WebLink url={l.from} />
                      {l.broken === true && (
                        <small>Provider reports broken</small>
                      )}
                    </td>
                    <td>
                      <WebLink url={l.to} />
                      <small>{l.anchor || "No anchor text returned"}</small>
                    </td>
                    <td>
                      {l.dofollow === null
                        ? "Unavailable"
                        : l.dofollow
                          ? "Follow"
                          : "Nofollow"}
                      {l.lost === true && <small>Lost</small>}
                    </td>
                    <td>{metric(l.rank)}</td>
                    <td>{l.lastSeen ?? "Unavailable"}</td>
                  </tr>
                )}
              />
            )}
            <p className="seo-caption">
              {tab === "domains"
                ? `${domains?.items.length ?? 0} sampled websites; ${metric(domains?.total)} matches in the provider index.`
                : `${links?.items.length ?? 0} sampled links; ${metric(links?.total)} matches in the provider index.`}{" "}
              {tab === "lost"
                ? "Lost links are explicitly marked by the provider. Review the source page before contacting a website owner."
                : "Live lists are sorted by provider rank or backlink count."}
            </p>
          </>
        )}
        <div className="scope-note">
          <p>
            Source: DataForSEO’s backlink index. Includes subdomains; excludes
            internal links. Coverage and discovery dates reflect that index, not
            every link on the web. A missing sampled link does not mean it was
            lost. Net changes compare saved totals, not counts of new or lost
            links. Strength scores are provider estimates. A low score alone is
            not a reason to disavow a link.
          </p>
          {state.job && (
            <p>
              Requested {dateTime(state.job.createdAt)}. Daily refreshes reuse
              the saved report (UTC). Each section may be collected at a
              slightly different time.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
