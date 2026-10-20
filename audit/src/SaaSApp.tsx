import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  LoaderCircle,
  LogOut,
  Plus,
  ShieldCheck,
} from "lucide-react";
import AuthScreen, { authClient } from "./AuthScreen";
import App from "./App";
import Connections from "./Connections";
import { api, type Account, type Project } from "./api";
export default function SaaSApp() {
  const { data: session, isPending } = authClient.useSession();
  const [account, setAccount] = useState<Account>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState(
    new URLSearchParams(location.search).get("connection") === "failed"
      ? "Google could not be connected. Open your website’s Connections page and try again."
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [setup, setSetup] = useState(
    new URLSearchParams(location.search).get("project") ?? "",
  );
  const [plan, setPlan] = useState<{
    configured: boolean;
    amount?: number;
    currency?: string;
    interval?: string;
  }>();
  async function load() {
    const [a, p] = await Promise.all([
      api<Account>("/api/account"),
      api<Project[]>("/api/projects"),
    ]);
    setAccount(a);
    setProjects(p);
  }
  useEffect(() => {
    if (session) {
      void load().catch((e) => setError(e.message));
      void api<typeof plan>("/api/billing/plan")
        .then(setPlan)
        .catch(() => {});
    } else {
      setAccount(undefined);
      setProjects([]);
      setSelected("");
    }
  }, [session?.user.id]);
  if (isPending)
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" />
        Opening your workspace…
      </div>
    );
  if (!session) return <AuthScreen />;
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const p = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, url }),
      });
      setProjects((current) => [p, ...current]);
      setAdding(false);
      setSetup(p.id);
      setName("");
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this website.");
    } finally {
      setBusy(false);
    }
  }
  async function billingAction() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>(
        account?.billing === "active"
          ? "/api/billing/portal"
          : "/api/billing/checkout",
        { method: "POST", body: "{}" },
      );
      location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const project = projects.find((p) => p.id === selected);
  const setupProject = projects.find((p) => p.id === setup);
  if (project && account)
    return (
      <App
        key={project.id}
        project={project}
        account={account}
        onProjects={() => {
          setSelected("");
          void load();
        }}
      />
    );
  return (
    <div className="projects-shell">
      <header className="project-top">
        <a className="brand" href="/">
          <span className="brand-icon">
            <span />
          </span>
          <span>
            audit<span className="brand-dot">.</span>
            <small>by zoomi</small>
          </span>
        </a>
        <span>{session.user.name}</span>
        <button
          className="button secondary"
          onClick={() => authClient.signOut()}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </header>
      <main className="projects-main">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {setupProject ? (
          <>
            <button className="text-button" onClick={() => setSetup("")}>
              <ArrowLeft size={16} />
              All websites
            </button>
            <div className="page-heading">
              <div>
                <div className="eyebrow">CONNECT YOUR WEBSITE</div>
                <h1>{setupProject.name}</h1>
                <p>{setupProject.url}</p>
              </div>
              <span
                className={`pill ${setupProject.verifiedAt ? "sage" : "neutral"}`}
              >
                {setupProject.verifiedAt
                  ? "Ownership verified"
                  : "Verification needed"}
              </span>
            </div>
            <Connections project={setupProject} onUpdate={() => void load()} />
            <section className="card verification-card">
              <h2>Or verify directly with your website</h2>
              <p>
                Ask your website manager to add this tag inside the homepage’s
                head, or add the DNS record below. Audit only checks public
                pages; this does not grant access to change your site.
              </p>
              <label>
                Website tag
                <code>{`<meta name="zoomi-audit-verification" content="${setupProject.verificationToken}">`}</code>
              </label>
              <label>
                DNS record
                <code>
                  Type: TXT
                  <br />
                  Name: _zoomi-audit.{new URL(setupProject.url).hostname}
                  <br />
                  Value: zoomi-audit={setupProject.verificationToken}
                </code>
              </label>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(`/api/projects/${setupProject.id}/verify`, {
                      method: "POST",
                      body: "{}",
                    });
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Verification failed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                Check verification
              </button>
              {setupProject.verifiedAt && (
                <button
                  className="button secondary"
                  onClick={() => setSelected(setupProject.id)}
                >
                  Open website <ArrowRight size={16} />
                </button>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR PRIVATE WORKSPACE</div>
                <h1>Good things start here.</h1>
                <p>
                  Add your website, connect your data, and start making
                  progress.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => setAdding(!adding)}
              >
                <Plus size={17} />
                Add a website
              </button>
            </div>
            <div className="subscription-banner">
              <div>
                <span className="pill sage">
                  {account?.billing === "active"
                    ? "Active subscription"
                    : "Subscription required"}
                </span>
                <h2>
                  {account?.billing === "active"
                    ? "Your growth workspace is ready."
                    : "Make Audit part of your business."}
                </h2>
                <p>
                  Up to {account?.limits.pages.toLocaleString() ?? "10,000"}{" "}
                  pages per audit · {account?.limits.projects ?? 5} websites ·{" "}
                  {account?.limits.crawlsPerMonth ?? 30} audits per month
                </p>
                {!account?.billingConfigured && (
                  <small>
                    Subscriptions are awaiting activation by Zoomi. Creating an
                    account does not start a free trial.
                  </small>
                )}
              </div>
              <button
                className="button primary"
                disabled={busy || !account?.billingConfigured}
                onClick={billingAction}
              >
                {account?.billing === "active"
                  ? "Manage subscription"
                  : plan?.amount != null
                    ? `Subscribe · ${new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency ?? "USD" }).format(plan.amount / 100)}/${plan.interval}`
                    : "Choose subscription"}
                <ArrowUpRightIcon />
              </button>
            </div>
            {adding && (
              <section className="card add-project">
                <h2>Give your website a home.</h2>
                <form onSubmit={add}>
                  <label>
                    Business or website name
                    <input
                      required
                      value={name}
                      maxLength={100}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your business"
                    />
                  </label>
                  <label>
                    Website address
                    <input
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://yourbusiness.com"
                    />
                  </label>
                  <button disabled={busy} className="button primary">
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    Add website
                  </button>
                </form>
              </section>
            )}
            {projects.length ? (
              <div className="project-grid">
                {projects.map((p) => (
                  <section className="card project-card" key={p.id}>
                    <div className="project-card-icon">
                      <Globe2 size={23} />
                    </div>
                    <span
                      className={`pill ${p.verifiedAt ? "sage" : "neutral"}`}
                    >
                      {p.verifiedAt
                        ? "Verified website"
                        : "Connect your website"}
                    </span>
                    <h2>{p.name}</h2>
                    <p>{new URL(p.url).hostname}</p>
                    <div>
                      <button
                        className="button primary"
                        onClick={() => setSelected(p.id)}
                      >
                        Open workspace <ArrowRight size={16} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setSetup(p.id)}
                      >
                        Connections
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              !adding && (
                <section className="card">
                  <div className="empty">
                    <Globe2 size={35} />
                    <h3>Your website belongs here.</h3>
                    <p>
                      Start by adding your website. We’ll help you connect
                      Google data and verify ownership before your first audit.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setAdding(true)}
                    >
                      Add my website <Plus size={16} />
                    </button>
                  </div>
                </section>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={16} />;
}
