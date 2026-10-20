import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, migrateAuth } from "./auth.ts";
import { appUrl, production, limits } from "./config.ts";
import { db, ownedProject, projectView, type ProjectRow } from "./database.ts";
import { normalizeUrl } from "./network.ts";
import {
  enqueue,
  recoverJobs,
  workOne,
  stopWorker,
  jobView,
  type Job,
} from "./jobs.ts";
import { verifySite } from "./verification.ts";
import * as google from "./google.ts";
import * as billing from "./billing.ts";
import * as research from "./research.ts";
import type { Audit } from "../src/types.ts";
await migrateAuth();
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (production) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  }
  const allowedHosts = [
    new URL(appUrl).hostname,
    ...(!production ? ["127.0.0.1", "localhost"] : []),
  ];
  if (!allowedHosts.includes(req.hostname))
    return res.status(403).json({ error: "Request host is not allowed." });
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  if (
    req.path !== "/api/billing/webhook" &&
    req.headers.origin &&
    req.headers.origin !== new URL(appUrl).origin
  )
    return res.status(403).json({ error: "Request origin is not allowed." });
  if (
    req.path.startsWith("/api/") &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    req.path !== "/api/billing/webhook" &&
    !req.headers.origin
  )
    return res
      .status(403)
      .json({ error: "A same-origin browser request is required." });
  next();
});
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    try {
      await billing.webhook(
        req.body,
        String(req.headers["stripe-signature"] ?? ""),
      );
      res.json({ received: true });
    } catch {
      res.status(400).json({ error: "Webhook was not accepted." });
    }
  },
);
app.all("/api/auth/{*splat}", toNodeHandler(auth));
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/public/config", (_req, res) =>
  res.json({ emailConfigured: !!process.env.RESEND_API_KEY }),
);
app.use("/api", async (req, res, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session)
    return res
      .status(401)
      .json({ error: "Please sign in to your Audit account." });
  res.locals.user = session.user;
  res.locals.session = session.session;
  next();
});
db.exec(
  "CREATE TABLE IF NOT EXISTS api_limits(key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL)",
);
app.use("/api", (req, res, next) => {
  const user = res.locals.user.id;
  const expensive =
    /\/(sync|verify|keyword-gap|properties)$/.test(req.path) &&
    req.method !== "GET";
  const key = `${user}:${expensive ? "expensive" : "general"}`;
  const bucket = Math.floor(Date.now() / 60000);
  const limit = expensive ? 5 : 180;
  const accepted = db.transaction(() => {
    const row = db
      .prepare("SELECT window,count FROM api_limits WHERE key=?")
      .get(key) as { window: number; count: number } | undefined;
    if (row?.window === bucket && row.count >= limit) return false;
    db.prepare(
      "INSERT INTO api_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN api_limits.window=excluded.window THEN api_limits.count+1 ELSE 1 END",
    ).run(key, bucket);
    return true;
  })();
  if (!accepted)
    return res
      .status(429)
      .json({ error: "Please wait a moment before trying again." });
  next();
});
app.get("/api/account", async (_req, res) =>
  res.json({
    user: res.locals.user,
    billing: billing.subscription(res.locals.user.id)?.status ?? "inactive",
    billingConfigured: billing.billingReady(),
    googleConfigured: google.googleReady(),
    limits,
  }),
);
app.get("/api/billing/plan", async (_req, res) =>
  res.json(await billing.planInfo()),
);
app.post("/api/billing/checkout", async (_req, res) =>
  res.json({
    url: await billing.checkout(res.locals.user.id, res.locals.user.email),
  }),
);
app.post("/api/billing/portal", async (_req, res) =>
  res.json({ url: await billing.billingPortal(res.locals.user.id) }),
);
app.get("/api/projects", (_req, res) =>
  res.json(
    (
      db
        .prepare(
          "SELECT * FROM projects WHERE owner_id=? ORDER BY created_at DESC",
        )
        .all(res.locals.user.id) as ProjectRow[]
    ).map(projectView),
  ),
);
app.post("/api/projects", (req, res) => {
  const owner = res.locals.user.id;
  if (typeof req.body?.url !== "string" || req.body.url.length > 2048)
    return res.status(400).json({ error: "Enter your website address." });
  const url = normalizeUrl(req.body.url);
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  const name =
    typeof req.body.name === "string"
      ? req.body.name.trim().slice(0, 100)
      : url.hostname;
  if (!name) return res.status(400).json({ error: "Name your website." });
  const count = (
    db
      .prepare("SELECT COUNT(*) n FROM projects WHERE owner_id=?")
      .get(owner) as { n: number }
  ).n;
  if (count >= limits.projects)
    return res
      .status(422)
      .json({ error: "Your account’s website allowance has been reached." });
  const p: ProjectRow = {
    id: randomUUID(),
    owner_id: owner,
    name,
    url: url.href,
    verification_token: randomBytes(24).toString("hex"),
    verified_at: null,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO projects VALUES(@id,@owner_id,@name,@url,@verification_token,@verified_at,@created_at)",
  ).run(p);
  res.status(201).json(projectView(p));
});
app.get("/api/google/callback", async (req, res) => {
  try {
    if (req.query.error) throw new Error("Google authorization was declined.");
    const project = await google.completeAuthorization(
      res.locals.user.id,
      res.locals.session.id,
      String(req.query.state ?? ""),
      String(req.query.code ?? ""),
    );
    res.redirect(
      `${appUrl}/?connection=google&project=${encodeURIComponent(project)}`,
    );
  } catch {
    res.redirect(`${appUrl}/?connection=failed`);
  }
});
app.use("/api/projects/:projectId", (req, res, next) => {
  const p = ownedProject(res.locals.user.id, String(req.params.projectId));
  if (!p) return res.status(404).json({ error: "Website not found." });
  res.locals.project = p;
  next();
});
app.post("/api/projects/:projectId/verify", async (_req, res) => {
  const p = res.locals.project as ProjectRow;
  await verifySite(p);
  db.prepare("UPDATE projects SET verified_at=? WHERE id=? AND owner_id=?").run(
    new Date().toISOString(),
    p.id,
    res.locals.user.id,
  );
  res.json(projectView(ownedProject(res.locals.user.id, p.id)!));
});
app.get("/api/projects/:projectId/audits", (_req, res) => {
  // Keep history small even when each saved crawl contains thousands of pages.
  res.json(
    db
      .prepare(
        `SELECT id, created_at AS createdAt,
    json_extract(data, '$.url') AS url, json_extract(data, '$.score') AS score,
    json_array_length(data, '$.pages') AS pageCount,
    json_array_length(data, '$.findings') AS findingCount
    FROM audits WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 100`,
      )
      .all(res.locals.user.id, res.locals.project.id),
  );
});
app.get("/api/projects/:projectId/audits/:id", (req, res) => {
  const row = db
    .prepare(
      "SELECT data FROM audits WHERE owner_id=? AND project_id=? AND id=?",
    )
    .get(res.locals.user.id, res.locals.project.id, req.params.id) as
    | { data: string }
    | undefined;
  if (!row) return res.status(404).json({ error: "Audit not found." });
  res.type("json").send(row.data);
});
app.get("/api/projects/:projectId/jobs", (_req, res) =>
  res.json(
    (
      db
        .prepare(
          "SELECT * FROM jobs WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20",
        )
        .all(res.locals.user.id, res.locals.project.id) as Job[]
    ).map(jobView),
  ),
);
app.post("/api/projects/:projectId/jobs", (req, res) => {
  if (!billing.entitled(res.locals.user.id))
    return res
      .status(402)
      .json({ error: "An active subscription is required to run audits." });
  const p = res.locals.project as ProjectRow;
  if (!p.verified_at)
    return res.status(403).json({
      error:
        "Verify ownership of this website or connect its Search Console property first.",
    });
  const pageLimit = Number(req.body?.pageLimit ?? limits.pages);
  if (
    !Number.isInteger(pageLimit) ||
    pageLimit < 100 ||
    pageLimit > limits.pages
  )
    return res.status(400).json({
      error: `Choose between 100 and ${limits.pages.toLocaleString()} pages.`,
    });
  res.status(202).json(enqueue(res.locals.user.id, p, pageLimit));
});
app.post("/api/projects/:projectId/jobs/:id/cancel", (req, res) => {
  const changed = db
    .prepare(
      "UPDATE jobs SET status='cancelled',updated_at=? WHERE id=? AND project_id=? AND owner_id=? AND status IN ('queued','running')",
    )
    .run(
      new Date().toISOString(),
      req.params.id,
      res.locals.project.id,
      res.locals.user.id,
    );
  if (!changed.changes)
    return res.status(404).json({ error: "No active audit found." });
  res.json({ cancelled: true });
});
app.patch("/api/projects/:projectId/audits/:id/tasks/:taskId", (req, res) => {
  const row = db
    .prepare(
      "SELECT data FROM audits WHERE id=? AND project_id=? AND owner_id=?",
    )
    .get(req.params.id, res.locals.project.id, res.locals.user.id) as
    | { data: string }
    | undefined;
  if (!row) return res.status(404).json({ error: "Audit not found." });
  const audit = JSON.parse(row.data) as Audit;
  if (
    !audit.findings.some((f) => f.id === req.params.taskId) ||
    typeof req.body?.completed !== "boolean"
  )
    return res.status(400).json({ error: "Invalid action." });
  audit.completed = audit.completed.filter((id) => id !== req.params.taskId);
  if (req.body.completed) audit.completed.push(req.params.taskId);
  db.prepare("UPDATE audits SET data=? WHERE id=? AND owner_id=?").run(
    JSON.stringify(audit),
    audit.id,
    res.locals.user.id,
  );
  res.json(audit);
});
app.get("/api/projects/:projectId/connections", (_req, res) => {
  const c = google.connection(res.locals.user.id, res.locals.project.id);
  res.json({
    configured: google.googleReady(),
    connected: !!c,
    searchConsole: c?.gsc_site,
    analytics: c?.ga_property,
    updatedAt: c?.updated_at,
  });
});
app.post("/api/projects/:projectId/connections/google", async (_req, res) =>
  res.json({
    url: await google.authorizationUrl(
      res.locals.user.id,
      res.locals.session.id,
      res.locals.project.id,
    ),
  }),
);
app.get("/api/projects/:projectId/connections/properties", async (_req, res) =>
  res.json(await google.properties(res.locals.user.id, res.locals.project)),
);
app.post(
  "/api/projects/:projectId/connections/properties",
  async (req, res) => {
    const gsc =
      typeof req.body.searchConsole === "string"
        ? req.body.searchConsole
        : undefined;
    const ga =
      typeof req.body.analytics === "string" ? req.body.analytics : undefined;
    await google.bindProperties(
      res.locals.user.id,
      res.locals.project,
      gsc,
      ga,
    );
    res.json({ saved: true });
  },
);
app.delete("/api/projects/:projectId/connections/google", async (_req, res) => {
  await google.disconnect(res.locals.user.id, res.locals.project.id);
  res.json({ disconnected: true });
});
app.post("/api/projects/:projectId/connections/sync", async (_req, res) =>
  res.json(await google.syncMetrics(res.locals.user.id, res.locals.project)),
);
app.get("/api/projects/:projectId/metrics", (_req, res) => {
  const row = db
    .prepare("SELECT data FROM metrics WHERE project_id=? AND owner_id=?")
    .get(res.locals.project.id, res.locals.user.id) as
    | { data: string }
    | undefined;
  res.json(row ? JSON.parse(row.data) : null);
});
app.get("/api/projects/:projectId/research", (_req, res) =>
  res.json({
    configured: research.researchReady(),
    reports: db
      .prepare(
        "SELECT data FROM research WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20",
      )
      .all(res.locals.user.id, res.locals.project.id)
      .map((r) => JSON.parse((r as { data: string }).data)),
  }),
);
app.post("/api/projects/:projectId/research/keyword-gap", async (req, res) => {
  if (!billing.entitled(res.locals.user.id))
    return res.status(402).json({
      error: "An active subscription is required for competitor research.",
    });
  if (
    typeof req.body.competitor !== "string" ||
    req.body.competitor.length > 2048 ||
    typeof req.body.country !== "string"
  )
    return res
      .status(400)
      .json({ error: "Enter a competitor website and search region." });
  res.json(
    await research.keywordGap(
      res.locals.user.id,
      res.locals.project,
      req.body.competitor,
      req.body.country,
    ),
  );
});
const dist = resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) =>
    req.path.startsWith("/api/")
      ? res.status(404).json({ error: "Not found" })
      : res.sendFile(resolve(dist, "index.html")),
  );
}
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = error instanceof Error ? error.message : "Request failed.";
    if (message.includes("UNIQUE constraint"))
      return res.status(409).json({
        error: "That website or audit already exists in your account.",
      });
    console.error(
      "Request failed:",
      error instanceof Error ? error.name : "Error",
    );
    res.status(422).json({
      error: message.includes("SQLITE")
        ? "Your request could not be saved."
        : message,
    });
  },
);
recoverJobs();
const timer = setInterval(() => {
  void workOne();
}, 1000);
const server = app.listen(
  Number(process.env.PORT ?? 4310),
  process.env.HOST ?? "127.0.0.1",
  () => console.log(`Audit ready at ${appUrl}`),
);
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    clearInterval(timer);
    stopWorker();
    server.close(() => {
      setTimeout(() => process.exit(0), 500).unref();
    });
  });
