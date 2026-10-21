import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

const directory = mkdtempSync(join(tmpdir(), "audit-saas-test-"));
const port = 14431;
const base = `http://127.0.0.1:${port}`;
let server: Server;
let database: typeof import("../server/database").db;
let alice = "";
let bob = "";
let owner = "";
let project = "";

async function request(
  path: string,
  method = "GET",
  data?: unknown,
  cookie = "",
  origin = base,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json();
  return {
    status: response.status,
    body,
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    AUDIT_DATA_DIR: directory,
    DATABASE_URL: "",
    APP_URL: base,
    RESEND_API_KEY: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_ID: "",
  });
  const { app } = await import("../server/app");
  database = (await import("../server/database")).db;
  server = app.listen(port, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
});
after(async () => {
  if (server)
    await new Promise<void>((r, reject) =>
      server.close((e) => (e ? reject(e) : r())),
    );
  await database?.close();
  rmSync(directory, { recursive: true, force: true });
});
test("sign-up creates persistent private sessions; unknown requests are unauthenticated", async () => {
  assert.equal((await request("/api/projects")).status, 401);
  const a = await request("/api/auth/sign-up/email", "POST", {
    name: "Account A",
    email: "account-a@example.test",
    password: "test-only-password-A-12345",
  });
  assert.equal(a.status, 200);
  assert.ok(a.cookie);
  alice = a.cookie;
  owner = a.body.user.id;
  const b = await request("/api/auth/sign-up/email", "POST", {
    name: "Account B",
    email: "account-b@example.test",
    password: "test-only-password-B-12345",
  });
  assert.equal(b.status, 200);
  bob = b.cookie;
  const me = await request("/api/account", "GET", undefined, alice);
  assert.equal(me.body.user.id, owner);
  assert.equal(me.body.billing, "inactive");
});
test("website creation is owner-scoped and never grants ownership automatically", async () => {
  const a = await request(
    "/api/projects",
    "POST",
    { name: "A website", url: "https://example.com/" },
    alice,
  );
  assert.equal(a.status, 201);
  assert.equal(a.body.verifiedAt, null);
  project = a.body.id;
  assert.equal(
    (await request("/api/projects", "GET", undefined, bob)).body.length,
    0,
  );
  assert.equal(
    (await request(`/api/projects/${project}/audits`, "GET", undefined, bob))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/connections`,
        "GET",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/jobs`,
        "POST",
        { pageLimit: 1000 },
        bob,
      )
    ).status,
    404,
  );
});
test("billing and ownership gate full crawls independently", async () => {
  assert.equal(
    (
      await request(
        `/api/projects/${project}/jobs`,
        "POST",
        { pageLimit: 10000 },
        alice,
      )
    ).status,
    402,
  );
  await database
    .prepare("INSERT INTO billing(owner_id,status,updated_at) VALUES(?,?,?)")
    .run(owner, "active", new Date().toISOString());
  assert.equal(
    (
      await request(
        `/api/projects/${project}/jobs`,
        "POST",
        { pageLimit: 10000 },
        alice,
      )
    ).status,
    403,
  );
});
test("private audit evidence and task changes cannot be accessed by another account", async () => {
  const audit = {
    id: "fixture-audit",
    url: "https://example.com/",
    createdAt: new Date().toISOString(),
    score: 90,
    pages: [],
    findings: [{ id: "test-task" }],
    completed: [],
    limit: 10000,
    skipped: [],
  };
  await database
    .prepare("INSERT INTO audits VALUES(?,?,?,?,?)")
    .run(audit.id, project, owner, audit.createdAt, JSON.stringify(audit));
  const own = await request(
    `/api/projects/${project}/audits`,
    "GET",
    undefined,
    alice,
  );
  assert.equal(own.body[0].id, audit.id);
  assert.equal(own.body[0].findingCount, 1);
  assert.equal(own.body[0].pages, undefined);
  assert.equal(
    (
      await request(
        `/api/projects/${project}/audits/${audit.id}`,
        "GET",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/audits/${audit.id}`,
        "GET",
        undefined,
        alice,
      )
    ).body.findings[0].id,
    "test-task",
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/audits/${audit.id}/tasks/test-task`,
        "PATCH",
        { completed: true },
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/audits/${audit.id}/tasks/test-task`,
        "PATCH",
        { completed: true },
        alice,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/api/projects/${project}/audits`, "GET", undefined, alice))
      .body[0].score,
    90,
  );
});
test("cross-origin writes and unavailable providers fail without success claims", async () => {
  assert.equal(
    (
      await request(
        "/api/projects",
        "POST",
        { url: "https://evil.example" },
        alice,
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/connections/google`,
        "POST",
        {},
        alice,
      )
    ).status,
    422,
  );
  assert.equal(
    (await request("/api/billing/checkout", "POST", {}, bob)).status,
    422,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/connections`,
        "GET",
        undefined,
        alice,
      )
    ).body.connected,
    false,
  );
});
test("large report chunks stay private and reassemble without corrupting Unicode", async () => {
  const value = {
    id: "large",
    url: "https://example.com",
    createdAt: new Date().toISOString(),
    score: 70,
    pages: [],
    findings: [],
    skipped: [],
    completed: [],
    limit: 10000,
    evidence: "🌿".repeat(600000),
  };
  await database
    .prepare("INSERT INTO audits VALUES(?,?,?,?,?)")
    .run(value.id, project, owner, value.createdAt, JSON.stringify(value));
  assert.equal(
    (
      await request(
        `/api/projects/${project}/audits/large?chunk=0`,
        "GET",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  let next: number | null = 0;
  let encoded = "";
  do {
    const r = await request(
      `/api/projects/${project}/audits/large?chunk=${next}`,
      "GET",
      undefined,
      alice,
    );
    assert.equal(r.status, 200);
    assert.ok(Buffer.byteLength(JSON.stringify(r.body)) < 1500000);
    encoded += r.body.chunk;
    next = r.body.next;
  } while (next !== null);
  assert.deepEqual(JSON.parse(encoded), value);
});

test("schedules and automatic activity stay private; invalid preferences cannot be saved", async () => {
  const prefs = {
    frequency: "weekly",
    timezone: "America/Indiana/Indianapolis",
    hour: 9,
    weekday: 1,
    pageLimit: 10000,
  };
  assert.equal(
    (
      await request(
        `/api/projects/${project}/schedules/audit`,
        "PUT",
        prefs,
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(`/api/projects/${project}/schedules`, "GET", undefined, bob))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/automation-runs`,
        "GET",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/schedules/audit`,
        "PUT",
        { ...prefs, timezone: "Invalid/Timezone" },
        alice,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/schedules/audit`,
        "PUT",
        { ...prefs, pageLimit: 10001 },
        alice,
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/schedules/audit`,
        "PUT",
        prefs,
        alice,
      )
    ).status,
    200,
  );
  const saved = await request(
    `/api/projects/${project}/schedules`,
    "GET",
    undefined,
    alice,
  );
  assert.equal(saved.body[0].timezone, prefs.timezone);
  assert.equal(saved.body[0].pageLimit, 10000);
  // Losing a subscription still permits preference changes, but not data refreshes.
  await database
    .prepare("UPDATE billing SET status='inactive' WHERE owner_id=?")
    .run(owner);
  assert.equal(
    (
      await request(
        `/api/projects/${project}/schedules/audit`,
        "PUT",
        { ...prefs, frequency: "off" },
        alice,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/connections/sync`,
        "POST",
        {},
        alice,
      )
    ).status,
    402,
  );
});
test("comparison evidence is paginated and cannot use reports from another website or account", async () => {
  const urls = Array.from(
    { length: 201 },
    (_, i) => `https://example.com/page-${i}`,
  );
  const before = {
    id: "compare-before",
    url: "https://example.com",
    createdAt: "2090-01-01T00:00:00Z",
    score: 50,
    pages: urls.map((url) => ({ url, status: 200 })),
    findings: [{ id: "title", title: "Missing title", severity: "high", urls }],
    completed: [],
    limit: 10000,
    skipped: [],
  };
  const current = {
    ...before,
    id: "compare-after",
    createdAt: "2090-01-02T00:00:00Z",
    findings: [],
  };
  for (const value of [before, current])
    await database
      .prepare("INSERT INTO audits VALUES(?,?,?,?,?)")
      .run(value.id, project, owner, value.createdAt, JSON.stringify(value));
  const path = `/api/projects/${project}/audits/compare-after/changes`;
  assert.equal((await request(path, "GET", undefined, bob)).status, 404);
  const result = await request(path, "GET", undefined, alice);
  assert.equal(result.status, 200);
  assert.equal(result.body.counts.resolved, 201);
  assert.equal(result.body.changes.length, 100);
  assert.equal(result.body.next, 100);
  const last = await request(path + "?offset=200", "GET", undefined, alice);
  assert.equal(last.body.changes.length, 1);
  assert.equal(last.body.next, null);
  assert.equal(
    (await request(path + "?offset=-1", "GET", undefined, alice)).status,
    400,
  );
  assert.equal(
    (await request(path + "?status=unknown", "GET", undefined, alice)).status,
    400,
  );
  const other = await request(
    "/api/projects",
    "POST",
    { name: "B website", url: "https://example.org" },
    bob,
  );
  const bobId = (await request("/api/account", "GET", undefined, bob)).body.user
    .id;
  await database
    .prepare("INSERT INTO audits VALUES(?,?,?,?,?)")
    .run(
      "bob-report",
      other.body.id,
      bobId,
      before.createdAt,
      JSON.stringify({ ...before, id: "bob-report" }),
    );
  assert.equal(
    (await request(path + "?previous=bob-report", "GET", undefined, alice))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/projects/${project}/audits/bob-report/changes`,
        "GET",
        undefined,
        alice,
      )
    ).status,
    404,
  );
});
test("research APIs keep keyword settings, history, competitors and reports private", async () => {
  const basePath = `/api/projects/${project}`;
  const saved = await request(
    basePath + "/keywords",
    "POST",
    { keyword: "garden design", country: "United States", device: "desktop" },
    alice,
  );
  assert.equal(saved.status, 201);
  const keyword = saved.body[0].id;
  assert.equal(
    (await request(basePath + "/keywords", "GET", undefined, bob)).status,
    404,
  );
  assert.equal(
    (
      await request(
        basePath + `/keywords/${keyword}`,
        "PATCH",
        { active: false },
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        basePath + `/keywords/${keyword}/history`,
        "GET",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        basePath + `/keywords/${keyword}`,
        "PATCH",
        { active: false },
        alice,
      )
    ).body[0].active,
    false,
  );
  assert.equal(
    (
      await request(
        basePath + "/competitors",
        "POST",
        { domain: "rival.com" },
        alice,
      )
    ).status,
    201,
  );
  assert.equal(
    (await request(basePath + "/competitors", "GET", undefined, bob)).status,
    404,
  );
  const now = new Date().toISOString();
  await database
    .prepare(
      "INSERT INTO seo_jobs(id,project_id,owner_id,kind,status,params,tasks,parts,period_key,total,done,created_at,updated_at) VALUES(?,?,?,'backlinks','complete',?,'[]',?,'private-report',1,1,?,?)",
    )
    .run(
      "private-seo",
      project,
      owner,
      JSON.stringify({ day: now.slice(0, 10) }),
      JSON.stringify([
        { key: "summary", label: "Backlinks", data: { backlinks: 12 } },
      ]),
      now,
      now,
    );
  assert.equal(
    (await request(basePath + "/seo/jobs/private-seo", "GET", undefined, alice))
      .body.parts[0].data.backlinks,
    12,
  );
  assert.equal(
    (await request(basePath + "/seo/jobs/private-seo", "GET", undefined, bob))
      .status,
    404,
  );
  assert.equal(
    (await request(basePath + "/seo/jobs/private-seo/cancel", "POST", {}, bob))
      .status,
    404,
  );
  const other = await database
    .prepare("SELECT id FROM projects WHERE owner_id<>? LIMIT 1")
    .get(owner);
  assert.equal(
    (
      await request(
        `/api/projects/${other.id}/seo/jobs/private-seo`,
        "GET",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  const denied = await request(
    `/api/projects/${other.id}/keywords/${keyword}/history`,
    "GET",
    undefined,
    bob,
  );
  assert.equal(denied.status, 422);
  assert.match(denied.body.error, /not found/);
  await database
    .prepare("UPDATE billing SET status='inactive' WHERE owner_id=?")
    .run(owner);
  const unpaid = await request(
    basePath + "/seo/jobs",
    "POST",
    { kind: "backlinks" },
    alice,
  );
  assert.equal(unpaid.status, 422);
  assert.match(unpaid.body.error, /subscription/);
  assert.equal(
    (
      await request(
        basePath + "/seo/jobs?kind=unknown",
        "GET",
        undefined,
        alice,
      )
    ).status,
    422,
  );
  // Saved results remain readable when a subscription is inactive.
  assert.equal(
    (await request(basePath + "/seo/jobs/private-seo", "GET", undefined, alice))
      .status,
    200,
  );
});
test("sign-out invalidates the customer session and password sign-in works", async () => {
  assert.equal(
    (await request("/api/auth/sign-out", "POST", {}, alice)).status,
    200,
  );
  assert.equal(
    (await request("/api/account", "GET", undefined, alice)).status,
    401,
  );
  const signed = await request("/api/auth/sign-in/email", "POST", {
    email: "account-a@example.test",
    password: "test-only-password-A-12345",
  });
  assert.equal(signed.status, 200);
  assert.ok(signed.cookie);
  assert.equal(
    (await request("/api/account", "GET", undefined, signed.cookie)).status,
    200,
  );
});
