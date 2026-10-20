import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const temp = mkdtempSync(join(tmpdir(), "audit-providers-"));
process.env.AUDIT_DATA_DIR = temp;
const { seal, unseal, hash } = await import("../server/crypto.ts");
const { matchesSearchProperty, completeAuthorization } = await import(
  "../server/google.ts"
);
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
