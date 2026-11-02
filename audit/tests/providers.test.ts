import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const temp = mkdtempSync(join(tmpdir(), "audit-providers-"));
process.env.AUDIT_DATA_DIR = temp;
const { seal, unseal, hash } = await import("../server/crypto.ts");
const {
  matchesSearchProperty,
  completeAuthorization,
  syncMetrics,
  disconnect,
} = await import("../server/google.ts");
const { parseGap } = await import("../server/research.ts");
const { db } = await import("../server/database.ts");
after(async () => {
  await db.close();
  rmSync(temp, { recursive: true, force: true });
});
test("refresh tokens are encrypted and tampering is rejected", () => {
  const secret = { refresh_token: "test-fixture-token" };
  const encrypted = seal(secret);
  assert.ok(!encrypted.includes("test-fixture-token"));
  assert.deepEqual(unseal(encrypted), secret);
  const parts = encrypted.split(".");
  const body = Buffer.from(parts[2], "base64url");
  body[0] ^= 1;
  parts[2] = body.toString("base64url");
  assert.throws(() => unseal(parts.join(".")));
});
test("Google properties match exact hosts or a real domain boundary", () => {
  assert.ok(
    matchesSearchProperty("sc-domain:example.com", "https://www.example.com/"),
  );
  assert.ok(
    matchesSearchProperty("https://example.com/", "https://example.com/"),
  );
  assert.equal(
    matchesSearchProperty("sc-domain:example.com", "https://notexample.com/"),
    false,
  );
  assert.equal(
    matchesSearchProperty(
      "https://example.com/",
      "https://example.com.evil.test/",
    ),
    false,
  );
  assert.equal(
    matchesSearchProperty(
      "https://example.com/private/",
      "https://example.com/",
    ),
    false,
  );
});
test("OAuth callbacks reject unknown, expired, and different-session states before calling Google", async () => {
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?)")
    .run("p", "owner", "Website", "https://example.com/", "token", null, now);
  await db
    .prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?,?)")
    .run(
      hash("state"),
      "owner",
      "session-a",
      "p",
      seal("verifier"),
      Date.now() + 60000,
    );
  await assert.rejects(
    () => completeAuthorization("owner", "session-b", "state", "code"),
    /expired/,
  );
  await assert.rejects(
    () => completeAuthorization("another-owner", "session-a", "state", "code"),
    /expired/,
  );
  await db.prepare("UPDATE oauth_states SET expires_at=0").run();
  await assert.rejects(
    () => completeAuthorization("owner", "session-a", "state", "code"),
    /expired/,
  );
});
test("keyword gap parsing keeps unavailable values null and rejects provider task failures", () => {
  const result = parseGap({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            total_count: 1,
            items: [{ keyword_data: { keyword: "garden design" } }],
          },
        ],
      },
    ],
  });
  assert.equal(result.items[0].volume, null);
  assert.equal(result.items[0].difficulty, null);
  assert.throws(
    () => parseGap({ status_code: 20000, tasks: [{ status_code: 40501 }] }),
    /could not complete/,
  );
});

async function connectedFixture() {
  const p = await db.prepare("SELECT * FROM projects WHERE id='p'").get();
  await db
    .prepare(
      "INSERT INTO connections(project_id,owner_id,tokens,gsc_site,updated_at,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET tokens=excluded.tokens,gsc_site=excluded.gsc_site,revision=excluded.revision",
    )
    .run(
      "p",
      "owner",
      seal({ refresh_token: "test-fixture" }),
      "sc-domain:example.com",
      new Date().toISOString(),
      "original",
    );
  return p;
}
test("disconnecting during a Google refresh cannot restore removed data", async () => {
  const p = await connectedFixture();
  let release!: () => void;
  let begin!: () => void;
  const started = new Promise<void>((r) => (begin = r));
  const gate = new Promise<void>((r) => (release = r));
  const requester = {
    request: async () => {
      begin();
      await gate;
      return { data: { rows: [] } };
    },
  } as unknown as Pick<import("google-auth-library").OAuth2Client, "request">;
  const refreshing = syncMetrics("owner", p, requester);
  const rejected = assert.rejects(refreshing, /connection changed/);
  await started;
  await disconnect("owner", "p", async () => {});
  release();
  await rejected;
  assert.equal(
    await db.prepare("SELECT * FROM connections WHERE project_id='p'").get(),
    undefined,
  );
  assert.equal(
    await db.prepare("SELECT * FROM metrics WHERE project_id='p'").get(),
    undefined,
  );
});
test("changing properties during a refresh rejects data from the old property", async () => {
  const p = await connectedFixture();
  let release!: () => void;
  let begin!: () => void;
  const started = new Promise<void>((r) => (begin = r));
  const gate = new Promise<void>((r) => (release = r));
  const requester = {
    request: async () => {
      begin();
      await gate;
      return { data: { rows: [] } };
    },
  } as unknown as Pick<import("google-auth-library").OAuth2Client, "request">;
  const refreshing = syncMetrics("owner", p, requester);
  const rejected = assert.rejects(refreshing, /connection changed/);
  await started;
  await db.transaction(async () => {
    await db
      .prepare(
        "UPDATE connections SET revision='new-property' WHERE project_id='p'",
      )
      .run();
  }, "connection:p")();
  release();
  await rejected;
  assert.equal(
    await db.prepare("SELECT * FROM metrics WHERE project_id='p'").get(),
    undefined,
  );
});
test("a slower earlier refresh cannot overwrite a more recent saved refresh", async () => {
  const p = await connectedFixture();
  await db
    .prepare("INSERT INTO metrics VALUES(?,?,?,?)")
    .run(
      "p",
      "owner",
      JSON.stringify({ marker: "latest" }),
      "2100-01-01T00:00:00.000Z",
    );
  const requester = {
    request: async () => ({ data: { rows: [] } }),
  } as unknown as Pick<import("google-auth-library").OAuth2Client, "request">;
  assert.equal((await syncMetrics("owner", p, requester)).marker, "latest");
  assert.equal(
    JSON.parse(
      (await db.prepare("SELECT data FROM metrics WHERE project_id='p'").get())
        .data,
    ).marker,
    "latest",
  );
  await disconnect("owner", "p", async () => {
    throw new Error("Provider unavailable");
  });
  assert.equal(
    await db.prepare("SELECT * FROM metrics WHERE project_id='p'").get(),
    undefined,
  );
});
