import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  LayoutDashboard,
  Leaf,
  Link2,
  LoaderCircle,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { Audit, AuditSummary, Finding, Section } from "./types";
import { api, loadAudit, type Account, type Project, type Job } from "./api";
import Connections, { type Metrics } from "./Connections";
import Competitors from "./Competitors";

const sections: { name: Section; icon: typeof Search }[] = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Action plan", icon: ClipboardList },
  { name: "Website audit", icon: Globe2 },
  { name: "Content studio", icon: FileText },
  { name: "Competitors", icon: Target },
  { name: "Progress", icon: TrendingUp },
];
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const pagePath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const sameSite = (a: { url: string }, b: { url: string }) =>
  host(a.url) === host(b.url);
function download(name: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className={wide ? "modal wide" : "modal"}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Score({ value, small = false }: { value: number; small?: boolean }) {
  const radius = small ? 32 : 64;
  const size = small ? 80 : 156;
  const c = 2 * Math.PI * radius;
  return (
    <div className={`score-ring ${small ? "small" : ""}`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e7ece4"
          strokeWidth={small ? 6 : 10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#37684f"
          strokeWidth={small ? 6 : 10}
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>
        <b>{value}</b>
        {!small && <small>out of 100</small>}
      </span>
    </div>
  );
}
function Empty({
  icon: Icon = Globe2,
  title,
  body,
  action,
}: {
  icon?: typeof Search;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export default function App({
  project,
  account,
  onProjects,
}: {
  project: Project;
  account: Account;
  onProjects: () => void;
}) {
  const base = `/api/projects/${project.id}`;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pageLimit, setPageLimit] = useState(account.limits.pages);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const finishedRef = useRef("");
  const [section, setSection] = useState<Section>("Overview");
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedAudit, setSelectedAudit] = useState<Audit>();
  const [pageNumber, setPageNumber] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [detail, setDetail] = useState<Finding | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("All actions");
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [brief, setBrief] = useState("");
  useEffect(() => {
    let alive = true;
    async function refreshAudits(selectNewest = false) {
      const data = await api<AuditSummary[]>(`${base}/audits`);
      if (alive) {
        setAudits(data);
        setSelected((current) =>
          selectNewest ? (data[0]?.id ?? "") : current || data[0]?.id || "",
        );
      }
    }
    async function refreshJobs() {
      const data = await api<Job[]>(`${base}/jobs`);
      if (!alive) return;
      setJobs(data);
      const complete = data
        .filter((j) => ["complete", "partial"].includes(j.status))
        .map((j) => j.id)
        .join();
      if (complete !== finishedRef.current) {
        finishedRef.current = complete;
        await refreshAudits(true);
      }
    }
    void Promise.all([
      refreshAudits(),
      refreshJobs(),
      api<Metrics | null>(`${base}/metrics`).then((m) => {
        if (alive) setMetrics(m);
      }),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const timer = setInterval(() => {
      void refreshJobs().catch((e) => {
        if (alive) setError(e.message);
      });
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [base]);
  useEffect(() => {
    let alive = true;
    setPageNumber(0);
    if (!selected) {
      setSelectedAudit(undefined);
      return;
    }
    const controller = new AbortController();
    setAuditLoading(true);
    void loadAudit(`${base}/audits/${selected}`, controller.signal)
      .then((a) => {
        if (alive) setSelectedAudit(a);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setAuditLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [base, selected]);
  const audit =
    (selectedAudit?.id === selected ? selectedAudit : undefined) ??
    ({
      id: "",
      url: project.url,
      createdAt: project.createdAt,
      score: 0,
      pages: [],
      findings: [],
      skipped: [],
      completed: [],
      limit: account.limits.pages,
    } as Audit);
  const hasAudit = !!audit.id;
  const matchingPages = audit.pages.filter((p) =>
    `${p.url} ${p.title}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visiblePages = matchingPages.slice(
    pageNumber * 100,
    (pageNumber + 1) * 100,
  );
  const activeJob = jobs.find((j) => ["queued", "running"].includes(j.status));
  const history = audits
    .filter((a) => sameSite(a, audit))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const previous = history.filter((a) => a.createdAt < audit.createdAt).at(-1);
  const remaining = audit.findings.filter(
    (f) => !audit.completed.includes(f.id),
  );
  const navigate = (name: Section) => {
    setSection(name);
    setMenu(false);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openScan = () => {
    setDomain(project.url);
    setScanMessage("");
    setScanOpen(true);
  };
  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    setScanning(true);
    setScanMessage("");
    try {
      const job = await api<Job>(`${base}/jobs`, {
        method: "POST",
        body: JSON.stringify({ pageLimit }),
      });
      setJobs((current) => [job, ...current]);
      setScanOpen(false);
      setSection("Overview");
      setError("");
    } catch (e) {
      setScanMessage(
        e instanceof Error ? e.message : "Could not start this audit.",
      );
    } finally {
      setScanning(false);
    }
  }
  async function toggleTask(f: Finding) {
    setSaving(true);
    try {
      const updated = await api<{ completed: string[] }>(
        `${base}/audits/${audit.id}/tasks/${f.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ completed: !audit.completed.includes(f.id) }),
        },
      );
      setSelectedAudit((current) =>
        current ? { ...current, completed: updated.completed } : current,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save action.");
    } finally {
      setSaving(false);
    }
  }
  function exportReport() {
    download(
      `audit-${host(audit.url)}.md`,
      [
        `# Audit by Zoomi — ${host(audit.url)}`,
        `Checked: ${audit.createdAt}`,
        `Health score: ${audit.score}/100. This measures our foundational checks, not search ranking.`,
        `Scope: ${audit.pages.length} pages checked, up to ${audit.limit}. HTML only; no JavaScript rendering.`,
        ...audit.findings.map(
          (f) =>
            `\n## ${f.title}\nPriority: ${f.severity}. ${audit.completed.includes(f.id) ? "Marked done; awaiting recheck." : "Open."}\n${f.why}\n${f.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nAffected pages:\n${f.urls.join("\n")}`,
        ),
        `\nSkipped pages:\n${audit.skipped.map((p) => `${p.url}: ${p.reason}`).join("\n") || "None."}`,
      ].join("\n\n"),
    );
  }
  function makeBrief(e: React.FormEvent) {
    e.preventDefault();
    const text = `# Content brief: ${topic.trim()}\n\nWebsite: ${host(audit.url)}\nAudience: ${audience.trim()}\n\n## Goal\nHelp this audience understand ${topic.trim().toLowerCase()} and decide on a useful next step.\n\n## Suggested structure\n1. Answer the main question clearly in the introduction.\n2. Explain who this is for and what they need to know.\n3. Show your process, relevant examples, and first-hand expertise.\n4. Explain costs, tradeoffs, or limitations where relevant.\n5. Answer common customer questions you have actually received.\n6. Offer a specific next step with your business.\n\n## Before publishing\n- Use a unique page title and one clear main headline.\n- Write a helpful search description.\n- Add original examples and verify every factual claim.\n- Describe meaningful images with alt text.\n- Link to relevant service pages.\n\n## Existing pages to consider\n${audit.pages
      .slice(0, 5)
      .map((p) => `- ${p.title || pagePath(p.url)}: ${p.url}`)
      .join(
        "\n",
      )}\n\nThis is a planning template based on your inputs. It is not AI-generated research and does not include search volume or competitor ranking data.`;
    setBrief(text);
  }
  const IssueRow = ({
    finding: f,
    index,
  }: {
    finding: Finding;
    index: number;
  }) => (
    <button
      className={`issue-row ${audit.completed.includes(f.id) ? "completed" : ""}`}
      onClick={() => setDetail(f)}
    >
      <span className="issue-number">
        {audit.completed.includes(f.id) ? (
          <Check size={16} />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </span>
      <span className="issue-copy">
        <strong>{f.title}</strong>
        <span>
          {f.category}
          <i /> {f.urls.length} {f.urls.length === 1 ? "page" : "pages"}
          <i />
          {f.effort}
        </span>
      </span>
      <span className={`pill ${f.severity === "high" ? "coral" : "sage"}`}>
        {audit.completed.includes(f.id)
          ? "Awaiting recheck"
          : f.severity === "high"
            ? "Fix first"
            : "Worth doing"}
      </span>
      <ArrowUpRight size={19} />
    </button>
  );
  return (
    <div className="app-shell">
      {menu && <div className="nav-backdrop" onClick={() => setMenu(false)} />}
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-icon">
            <span />
          </span>
          <span>
            audit<span className="brand-dot">.</span>
            <small>by zoomi</small>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <label className="site-switcher">
          <span className="site-avatar">
            <Globe2 size={17} />
          </span>
          <select
            aria-label="Choose website audit"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setDetail(null);
            }}
          >
            <option value="" disabled>
              Choose an audit
            </option>
            {audits.map((a) => (
              <option key={a.id} value={a.id}>
                {host(a.url)} · {date(a.createdAt)}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <nav aria-label="Main navigation">
          {sections.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={section === name ? "nav-item active" : "nav-item"}
              onClick={() => navigate(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Action plan" && <b>{remaining.length}</b>}
              {name === "Content studio" && (
                <span className="nav-new">NEW</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="growth-note">
            <span className="growth-icon">
              <Leaf size={20} />
            </span>
            <h3>Small steps. Real growth.</h3>
            <p>A healthier website starts with your next good move.</p>
            <button onClick={() => navigate("Action plan")}>
              Find your next step <ArrowRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${section === "Connections" ? "active" : ""}`}
            onClick={() => navigate("Connections")}
          >
            <Link2 size={18} />
            Connections
          </button>
          <button
            className="nav-item"
            onClick={() =>
              setInfo(
                "Audit discovers your website through links and sitemaps and checks up to your selected page allowance. Each finding includes an explanation and a practical next step. Marking an action done records your progress; only a fresh scan can confirm the change. Your audits are saved privately in your customer account.",
              )
            }
          >
            <CircleHelp size={18} />
            How Audit works
          </button>
          <div className="profile">
            <span className="avatar">Z</span>
            <button className="text-button" onClick={onProjects}>
              {account.user.name}
              <small>All websites & billing</small>
            </button>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} /> <b>{section}</b>
            </span>
          </div>
          <div className="top-actions">
            <span className="preview-tag">
              <span /> Your private workspace
            </span>
            <button
              className="help-button"
              aria-label="What’s included"
              onClick={() =>
                setInfo(
                  "Audit combines website crawls with your authorized Google Search Console and Analytics data. You can run audits, track fixes, compare checkpoints, and plan content. Manage your websites and subscription from your account.",
                )
              }
            >
              <CircleHelp size={18} />
              <span>What’s included</span>
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR WEBSITE, MOVING FORWARD</div>
              <h1>
                {section === "Overview"
                  ? "Your next move, made clear."
                  : section === "Action plan"
                    ? "A little progress goes a long way."
                    : section === "Website audit"
                      ? "Get to know your website."
                      : section === "Content studio"
                        ? "Make something worth finding."
                        : section === "Competitors"
                          ? "A little perspective helps."
                          : section === "Progress"
                            ? "See how far you’ve come."
                            : "Bring the bigger picture together."}
              </h1>
              <p>
                {section === "Overview"
                  ? "Understand what’s working. Know what to work on next."
                  : section === "Action plan"
                    ? "Practical improvements, in an order that makes sense."
                    : section === "Website audit"
                      ? "The details behind your score, explained without the guesswork."
                      : section === "Content studio"
                        ? "Turn your expertise into a clear plan for your next page."
                        : section === "Competitors"
                          ? "Find customer searches that competitors cover and your website could answer."
                          : section === "Progress"
                            ? "Every fresh audit is another checkpoint for your website."
                            : "More context means better decisions for your business."}
              </p>
            </div>
            <button className="button primary" onClick={openScan}>
              <Plus size={17} />
              Run new audit
            </button>
          </div>
          <div className="site-context">
            <div>
              <span className="site-favicon">
                {host(audit.url).slice(0, 1).toUpperCase()}
              </span>
              <strong>{project.name}</strong>
              <span className="context-domain">{host(audit.url)}</span>
              <span className="pill neutral">
                {hasAudit
                  ? "Live scan"
                  : project.verifiedAt
                    ? "Verified website"
                    : "Verification required"}
              </span>
            </div>
            <span className="last-checked">
              {loading || auditLoading ? (
                <>
                  <LoaderCircle className="spin" size={14} /> Loading saved
                  audits
                </>
              ) : (
                <>
                  <span className="status-dot" />
                  {hasAudit
                    ? `Checked ${date(audit.createdAt)}`
                    : "Ready for your first audit"}
                </>
              )}
            </span>
          </div>
          {activeJob && (
            <div className="job-banner">
              <LoaderCircle className="spin" size={22} />
              <div>
                <strong>
                  {activeJob.status === "queued"
                    ? "Your audit is queued."
                    : "Your website audit is running."}
                </strong>
                <p>
                  {activeJob.pagesDone.toLocaleString()} pages checked ·{" "}
                  {activeJob.discovered.toLocaleString()} discovered · up to{" "}
                  {activeJob.pageLimit.toLocaleString()} pages. You can leave
                  this page and come back.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api(`${base}/jobs/${activeJob.id}/cancel`, {
                      method: "POST",
                      body: "{}",
                    });
                    setJobs((current) =>
                      current.map((j) =>
                        j.id === activeJob.id
                          ? { ...j, status: "cancelled" }
                          : j,
                      ),
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not cancel audit.",
                    );
                  }
                }}
              >
                Cancel audit
              </button>
            </div>
          )}
          {jobs[0]?.status === "failed" && (
            <div className="error-banner" role="alert">
              Your latest audit could not finish: {jobs[0].error}
            </div>
          )}
          {!hasAudit &&
            !auditLoading &&
            !loading &&
            !["Connections", "Content studio", "Competitors"].includes(
              section,
            ) && (
              <section className="card">
                <Empty
                  icon={Globe2}
                  title="Let’s see what your website can do."
                  body={
                    project.verifiedAt
                      ? "Run your first audit to find issues across your website. Connect Google to add search and visitor data."
                      : "Connect Search Console or verify ownership to start auditing this website."
                  }
                  action={
                    <>
                      <button
                        className="button primary"
                        onClick={project.verifiedAt ? openScan : onProjects}
                      >
                        {project.verifiedAt
                          ? "Start website audit"
                          : "Verify my website"}
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => navigate("Connections")}
                      >
                        Connect Google data
                      </button>
                    </>
                  }
                />
              </section>
            )}
          {section === "Overview" && hasAudit && (
            <>
              <div className="overview-grid">
                <section className="health-card">
                  <div className="card-kicker">
                    <ShieldCheck size={17} /> WEBSITE HEALTH{" "}
                    <button
                      className="icon-button"
                      aria-label="About health score"
                      onClick={() =>
                        setInfo(
                          "The health score starts at 100 and subtracts weighted findings across the pages we checked. It measures foundational website checks, not Google rankings, traffic, conversions, or full accessibility. Skipped pages are excluded.",
                        )
                      }
                    >
                      <CircleHelp size={16} />
                    </button>
                  </div>
                  <div className="health-body">
                    <Score value={audit.score} />
                    <div>
                      <span className="pill sage">
                        {audit.score >= 90
                          ? "A strong foundation"
                          : audit.score >= 70
                            ? "Room to grow"
                            : "Let’s build a better foundation"}
                      </span>
                      <h2>
                        {audit.score >= 90
                          ? "Good things to build on."
                          : "Good things are taking shape."}
                      </h2>
                      <p>
                        {remaining.length
                          ? `${remaining.length} improvements to help your website put its best foot forward.`
                          : "No open findings in the pages checked. Keep checking as your website grows."}
                      </p>
                    </div>
                  </div>
                  <div className="health-footer">
                    <span>
                      {previous
                        ? `${audit.score - previous.score >= 0 ? "+" : ""}${audit.score - previous.score} points since your last audit`
                        : "Your first benchmark. Let’s grow from here."}
                    </span>
                    <button onClick={() => navigate("Website audit")}>
                      Explore audit <ArrowRight size={15} />
                    </button>
                  </div>
                </section>
                <section className="next-card">
                  <div className="card-kicker">
                    <Sparkles size={16} /> YOUR NEXT BEST STEP
                  </div>
                  <h2>
                    {remaining[0]?.title ?? "Keep your website moving forward"}
                  </h2>
                  <p>
                    {remaining[0]?.why ??
                      "Run a fresh audit after your next website update to catch any new issues."}
                  </p>
                  <div className="next-footer">
                    <span>{remaining[0]?.effort ?? "A few minutes"}</span>
                    <button
                      onClick={() =>
                        remaining[0] ? setDetail(remaining[0]) : openScan()
                      }
                    >
                      Let’s do this <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="next-decoration" aria-hidden="true">
                    ↗
                  </div>
                </section>
              </div>
              <div className="metrics">
                <div className="metric">
                  <span>
                    <Globe2 size={17} />
                    Pages checked
                  </span>
                  <strong>
                    {audit.pages.length}
                    <small> / {audit.limit} max</small>
                  </strong>
                  <p>
                    {audit.coverage?.partial
                      ? "Partial crawl · review coverage"
                      : "Discovered website pages checked"}
                  </p>
                </div>
                <div className="metric">
                  <span>
                    <ClipboardList size={17} />
                    Open improvements
                  </span>
                  <strong>
                    {remaining.length}
                    <small> action groups</small>
                  </strong>
                  <p>
                    {audit.findings.filter((f) => f.severity === "high").length}{" "}
                    high-priority findings
                  </p>
                </div>
                <div className="metric">
                  <span>
                    <CheckCheck size={17} />
                    Actions marked done
                  </span>
                  <strong>
                    {audit.completed.length}
                    <small> / {audit.findings.length}</small>
                  </strong>
                  <p>Re-run to verify your changes</p>
                </div>
                <div className="metric">
                  <span>
                    <BarChart3 size={17} />
                    Search performance
                  </span>
                  <strong className="not-connected">
                    {metrics?.searchConsole
                      ? `${metrics.searchConsole.summary.rows?.[0]?.clicks ?? 0} clicks`
                      : "Connect Google"}
                  </strong>
                  <button onClick={() => navigate("Connections")}>
                    View connected data <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
              <div className="lower-grid">
                <section className="card action-card">
                  <div className="section-head">
                    <div>
                      <h2>A few things worth your attention</h2>
                      <p>The next steps with the clearest benefit.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Action plan")}
                    >
                      View action plan <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="issue-list">
                    {remaining.slice(0, 3).map((f, i) => (
                      <IssueRow key={f.id} finding={f} index={i} />
                    ))}
                    {!remaining.length && (
                      <Empty
                        icon={CheckCheck}
                        title="Your action list is clear"
                        body="Run another audit to verify your changes and find anything new."
                      />
                    )}
                  </div>
                  <div className="card-bottom">
                    <Leaf size={15} />
                    <span>
                      You don’t need to fix everything today. Start with one.
                    </span>
                  </div>
                </section>
                <section className="card growth-card">
                  <span className="tiny-label">BEYOND THE BASICS</span>
                  <div className="content-art" aria-hidden="true">
                    <div className="paper">
                      <i />
                      <i />
                      <i />
                      <div />
                      <i />
                      <i />
                    </div>
                    <span>
                      <Sparkles size={26} />
                    </span>
                  </div>
                  <h2>
                    Your expertise deserves
                    <br />
                    to be discovered.
                  </h2>
                  <p>
                    Build a useful content brief around the questions your
                    customers ask.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("Content studio")}
                  >
                    Open content studio <ArrowUpRight size={17} />
                  </button>
                </section>
              </div>
            </>
          )}
          {section === "Action plan" && hasAudit && (
            <section className="card">
              <div className="section-head">
                <div>
                  <h2>
                    Your action plan{" "}
                    <span className="count">{remaining.length} open</span>
                  </h2>
                  <p>
                    Mark work done, then run a new audit to confirm the fix.
                  </p>
                </div>
                <button className="button secondary" onClick={exportReport}>
                  <Download size={16} />
                  Export plan
                </button>
              </div>
              <div className="filters">
                {["All actions", "Fix first", "Worth doing", "Marked done"].map(
                  (f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ),
                )}
              </div>
              <div className="issue-list">
                {audit.findings
                  .filter(
                    (f) =>
                      filter === "All actions" ||
                      (filter === "Fix first" &&
                        f.severity === "high" &&
                        !audit.completed.includes(f.id)) ||
                      (filter === "Worth doing" &&
                        f.severity !== "high" &&
                        !audit.completed.includes(f.id)) ||
                      (filter === "Marked done" &&
                        audit.completed.includes(f.id)),
                  )
                  .map((f, i) => (
                    <IssueRow finding={f} index={i} key={f.id} />
                  ))}
              </div>
              {!audit.findings.some(
                (f) =>
                  filter === "All actions" ||
                  (filter === "Fix first" &&
                    f.severity === "high" &&
                    !audit.completed.includes(f.id)) ||
                  (filter === "Worth doing" &&
                    f.severity !== "high" &&
                    !audit.completed.includes(f.id)) ||
                  (filter === "Marked done" && audit.completed.includes(f.id)),
              ) && (
                <Empty
                  icon={CheckCheck}
                  title="Nothing here right now"
                  body="Choose another filter to see your other actions."
                />
              )}
            </section>
          )}
          {section === "Website audit" && hasAudit && (
            <>
              <div className="audit-summary card">
                <Score value={audit.score} small />
                <div>
                  <h2>{audit.pages.length} pages. A clearer picture.</h2>
                  <p>
                    We checked public HTML for titles, descriptions, headings,
                    image descriptions, search directives, mobile settings, and
                    more.
                  </p>
                </div>
                <button className="button secondary" onClick={exportReport}>
                  <Download size={16} />
                  Export report
                </button>
              </div>
              <section className="card">
                <div className="section-head">
                  <div>
                    <h2>Your pages</h2>
                    <p>Select a page to review its findings.</p>
                  </div>
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Search pages"
                      placeholder="Find a page…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPageNumber(0);
                      }}
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Page</th>
                        <th>Response</th>
                        <th>Words</th>
                        <th>Findings</th>
                        <th>Search directive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePages.map((p) => (
                        <tr key={p.url}>
                          <td>
                            <button
                              className="page-link"
                              onClick={() =>
                                setInfo(
                                  `${p.title || "Untitled page"}\n${p.url}\n\nSearch description: ${p.description || "Missing"}\nMain heading: ${p.h1.join(" · ") || "Missing"}\n\nFindings:\n${
                                    audit.findings
                                      .filter((f) => f.urls.includes(p.url))
                                      .map((f) => f.title)
                                      .join("\n") ||
                                    "No issues found in our foundational checks."
                                  }`,
                                )
                              }
                            >
                              {pagePath(p.url)}
                              <ArrowUpRight size={13} />
                            </button>
                            <small>{p.title || "No search title"}</small>
                          </td>
                          <td>
                            <span
                              className={`pill ${p.status < 400 ? "sage" : "coral"}`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td>{p.wordCount}</td>
                          <td>
                            {
                              audit.findings.filter((f) =>
                                f.urls.includes(p.url),
                              ).length
                            }
                          </td>
                          <td>
                            {p.noindex
                              ? "Asks not to be indexed"
                              : "No noindex found"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {matchingPages.length > 100 && (
                  <div className="table-pagination">
                    <span>
                      {pageNumber * 100 + 1}–
                      {Math.min((pageNumber + 1) * 100, matchingPages.length)}{" "}
                      of {matchingPages.length.toLocaleString()} pages
                    </span>
                    <button
                      className="button secondary"
                      disabled={pageNumber === 0}
                      onClick={() => setPageNumber((n) => n - 1)}
                    >
                      Previous
                    </button>
                    <button
                      className="button secondary"
                      disabled={(pageNumber + 1) * 100 >= matchingPages.length}
                      onClick={() => setPageNumber((n) => n + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
                <div className="scope-note">
                  <CircleHelp size={15} />
                  <p>
                    This audit checked {audit.pages.length.toLocaleString()}{" "}
                    pages with a {audit.limit.toLocaleString()}-page allowance.{" "}
                    {audit.coverage?.partial
                      ? `Coverage is partial: ${audit.coverage.remaining} URLs remain queued and ${audit.skipped.length} pages were skipped.`
                      : "The discovered page queue was completed."}{" "}
                    We follow robots.txt and don’t render JavaScript. “No
                    noindex found” does not confirm that Google has indexed a
                    page.
                  </p>
                </div>
              </section>
              {audit.skipped.length > 0 && (
                <section className="card skipped">
                  <h2>Pages we couldn’t check</h2>
                  {audit.skipped.map((p, i) => (
                    <p key={i}>
                      <b>{p.url}</b>
                      <br />
                      {p.reason}
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
          {section === "Content studio" && (
            <div className="studio-grid">
              <section className="card studio-form">
                <span className="pill sage">
                  <Leaf size={13} /> A useful place to start
                </span>
                <h2>
                  What do your customers
                  <br />
                  want to know?
                </h2>
                <p>
                  Start with one topic. We’ll turn it into a practical outline
                  you can make your own.
                </p>
                <form onSubmit={makeBrief}>
                  <label>
                    What will this page be about?
                    <input
                      required
                      maxLength={180}
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. How to choose an interior designer"
                    />
                  </label>
                  <label>
                    Who are you writing for?
                    <textarea
                      required
                      maxLength={400}
                      rows={3}
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      placeholder="e.g. Homeowners planning their first renovation"
                    />
                  </label>
                  <button className="button primary" type="submit">
                    <FileText size={16} />
                    Build my brief
                  </button>
                </form>
                <p className="form-note">
                  A structured planning template using your inputs and scanned
                  pages. Search demand and AI research are not connected.
                </p>
              </section>
              <section className="card brief-preview">
                {brief ? (
                  <>
                    <div className="section-head">
                      <h2>Your starting point</h2>
                      <button
                        className="button secondary"
                        onClick={() => download("content-brief.md", brief)}
                      >
                        <Download size={15} />
                        Download
                      </button>
                    </div>
                    <pre>{brief}</pre>
                  </>
                ) : (
                  <Empty
                    icon={FileText}
                    title="A blank page, with a little direction"
                    body="Your brief will include a suggested structure, publishing checklist, and relevant pages to link to."
                  />
                )}
              </section>
            </div>
          )}
          {section === "Competitors" && <Competitors project={project} />}
          {section === "Progress" && hasAudit && (
            <section className="card">
              <div className="section-head">
                <div>
                  <h2>Your website’s story so far</h2>
                  <p>Compare independent scans of {host(audit.url)}.</p>
                </div>
                <button className="button secondary" onClick={openScan}>
                  <RefreshCw size={16} />
                  Check again
                </button>
              </div>
              {history.length ? (
                <>
                  <div className="history-chart">
                    {history.slice(-10).map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelected(a.id)}
                        aria-label={`View audit from ${date(a.createdAt)}, score ${a.score}`}
                      >
                        <b>{a.score}</b>
                        <div
                          style={{ height: `${Math.max(a.score * 1.6, 3)}px` }}
                          className={a.id === audit.id ? "current" : ""}
                        />
                        <span>{date(a.createdAt)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="history-list">
                    {[...history].reverse().map((a) => (
                      <button key={a.id} onClick={() => setSelected(a.id)}>
                        <span>
                          <ShieldCheck size={18} />
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                        <span>
                          {a.pageCount} pages · {a.findingCount} findings
                        </span>
                        <strong>
                          {a.score}/100 <ChevronRight size={17} />
                        </strong>
                      </button>
                    ))}
                  </div>
                  <div className="scope-note">
                    <CircleHelp size={15} />
                    <p>
                      Changes in pages checked can affect the score. Marking a
                      task done doesn’t change the score; a new scan measures
                      the result.
                    </p>
                  </div>
                </>
              ) : (
                <Empty
                  icon={TrendingUp}
                  title="Your first audit is the starting line"
                  body="Run a live audit to establish your baseline. Future scans will show how your website changes over time."
                  action={
                    <button className="button primary" onClick={openScan}>
                      Audit my website <ArrowRight size={16} />
                    </button>
                  }
                />
              )}
            </section>
          )}
          {section === "Connections" && <Connections project={project} />}
          <footer className="page-footer">
            <span>
              <span className="footer-mark">a.</span>A little clarity. A better
              website.
            </span>
            <span>Built with care by Zoomi.</span>
          </footer>
        </main>
      </div>
      {scanOpen && (
        <Modal
          title="Meet your next opportunity."
          onClose={() => {
            if (!scanning) setScanOpen(false);
          }}
        >
          <p className="modal-intro">
            Audit discovers pages through your website’s links and sitemaps.
            Choose how many pages to check in this run.
          </p>
          <form onSubmit={runScan}>
            <label>
              Your website address
              <input
                required
                readOnly
                maxLength={2048}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="yourbusiness.com"
                autoComplete="url"
              />
            </label>
            <label>
              Pages to audit
              <select
                value={pageLimit}
                onChange={(e) => setPageLimit(Number(e.target.value))}
              >
                {[100, 1000, 5000, 10000]
                  .filter((n) => n <= account.limits.pages)
                  .map((n) => (
                    <option key={n} value={n}>
                      Up to {n.toLocaleString()} pages
                    </option>
                  ))}
              </select>
            </label>
            {scanMessage && (
              <div className="error-banner" role="alert">
                {scanMessage}
              </div>
            )}
            {scanning && (
              <div className="scan-progress" role="status">
                <LoaderCircle className="spin" size={23} />
                <div>
                  <b>Getting to know your website…</b>
                  <p>
                    Your audit will continue in the background. You can return
                    to view its progress.
                  </p>
                </div>
              </div>
            )}
            <div className="scan-scope">
              <ShieldCheck size={18} />
              <p>
                Public pages only. We respect your website’s crawl settings.
                Results are saved privately in your account.
              </p>
            </div>
            <button
              className="button primary full"
              disabled={scanning}
              type="submit"
            >
              {scanning ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  Audit in progress
                </>
              ) : (
                <>
                  Find my next steps <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} wide>
          <div className="detail-meta">
            <span
              className={`pill ${detail.severity === "high" ? "coral" : "sage"}`}
            >
              {detail.severity === "high" ? "Fix first" : "Worth doing"}
            </span>
            <span>{detail.category}</span>
            <span>{detail.effort}</span>
          </div>
          <h3>Why it matters</h3>
          <p>{detail.why}</p>
          <h3>Here’s how to make it better</h3>
          <ol className="steps">
            {detail.steps.map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <h3>Where to look</h3>
          <div className="affected-pages">
            {detail.urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                {u}
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
          <div className="detail-actions">
            <button
              disabled={saving}
              className="button primary"
              onClick={() => toggleTask(detail)}
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}{" "}
              {audit.completed.includes(detail.id)
                ? "Reopen this action"
                : "Mark as done"}
            </button>
            <span>
              {audit.completed.includes(detail.id)
                ? "Saved. Re-run the audit to verify."
                : "Your score updates after a new scan."}
            </span>
          </div>
        </Modal>
      )}
      {info && (
        <Modal title="A little more context" onClose={() => setInfo("")}>
          <p className="info-text">{info}</p>
          <button className="button primary" onClick={() => setInfo("")}>
            Got it <Check size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
