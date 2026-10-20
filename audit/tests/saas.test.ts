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
