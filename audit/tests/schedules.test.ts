import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectRow } from "../server/database";
const dir = mkdtempSync(join(tmpdir(), "audit-schedules-"));
process.env.AUDIT_DATA_DIR = dir;
process.env.DATABASE_URL = "";
const { db } = await import("../server/database");
const { saveSchedule, queueDueSchedules, runGoogleRefresh, listSchedules } =
  await import("../server/schedules");
const { enqueue } = await import("../server/jobs");
const { limits } = await import("../server/config");
const beforeDue = new Date("2026-07-01T08:00:00Z");
const due = new Date("2026-07-01T09:00:00Z");
const preferences = {
  frequency: "daily",
  timezone: "UTC",
  hour: 9,
  weekday: 1,
  pageLimit: 10000,
};
async function fixture(
  id: string,
  paid = true,
  verified = true,
): Promise<ProjectRow> {
  const p = {
    id,
    owner_id: id,
    name: id,
    url: `https://${id}.example/`,
    verification_token: "fixture",
    verified_at: verified ? beforeDue.toISOString() : null,
    created_at: beforeDue.toISOString(),
  };
  await db
    .prepare(
      "INSERT INTO projects VALUES(@id,@owner_id,@name,@url,@verification_token,@verified_at,@created_at)",
    )
    .run(p);
  await db
    .prepare("INSERT INTO billing(owner_id,status,updated_at) VALUES(?,?,?)")
    .run(id, paid ? "active" : "inactive", beforeDue.toISOString());
  return p;
}
async function google(id: string) {
  await db
    .prepare(
      "INSERT INTO connections(project_id,owner_id,tokens,gsc_site,updated_at) VALUES(?,?,?,?,?)",
    )
    .run(id, id, "fixture", `sc-domain:${id}.example`, beforeDue.toISOString());
}
after(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("overlapping schedule deliveries reserve one audit and advance once", async () => {
  const p = await fixture("duplicate");
  await saveSchedule(p.owner_id, p.id, "audit", preferences, beforeDue);
  const deliveries = await Promise.all([
    queueDueSchedules(due),
    queueDueSchedules(due),
  ]);
  assert.equal(deliveries.flatMap((r) => r.audits).length, 1);
  assert.equal(
    Number(
      (
        await db
          .prepare("SELECT COUNT(*) n FROM jobs WHERE owner_id=?")
          .get(p.id)
      ).n,
    ),
    1,
  );
  assert.equal(
    (await listSchedules(p.id, p.id))[0].nextRunAt,
    "2026-07-02T09:00:00.000Z",
  );
});
test("an automatic and a manual audit share concurrency and monthly allowances", async () => {
  const p = await fixture("manual");
  await saveSchedule(p.id, p.id, "audit", preferences, beforeDue);
  await Promise.allSettled([
    queueDueSchedules(due),
    enqueue(p.id, p, 100, due),
  ]);
  assert.equal(
    Number(
      (
        await db
          .prepare("SELECT COUNT(*) n FROM jobs WHERE owner_id=?")
          .get(p.id)
      ).n,
    ),
    1,
  );
  const q = await fixture("quota");
  await saveSchedule(q.id, q.id, "audit", preferences, beforeDue);
  for (let i = 0; i < limits.crawlsPerMonth; i++)
    await db
      .prepare(
        "INSERT INTO jobs(id,project_id,owner_id,status,page_limit,created_at,updated_at) VALUES(?,?,?,'complete',100,?,?)",
      )
      .run(
        `quota-${i}`,
        q.id,
        q.id,
        beforeDue.toISOString(),
        beforeDue.toISOString(),
      );
  const result = await queueDueSchedules(due);
  assert.equal(result.audits.length, 0);
  const saved = (await listSchedules(q.id, q.id))[0];
  assert.match(saved.error!, /monthly/);
  assert.equal(saved.nextRunAt, "2026-08-01T09:00:00.000Z");
});
test("unpaid, unverified and disconnected websites wait without consuming an audit or refresh", async () => {
  for (const id of ["unpaid", "unverified", "disconnected"]) {
    await fixture(id, id !== "unpaid", id !== "unverified");
    await saveSchedule(
      id,
      id,
      id === "disconnected" ? "google" : "audit",
      preferences,
      beforeDue,
    );
  }
  const result = await queueDueSchedules(due);
  assert.deepEqual(result, { audits: [], refreshes: [], research: [] });
  for (const id of ["unpaid", "unverified", "disconnected"])
    assert.equal((await listSchedules(id, id))[0].status, "waiting");
});
test("pausing withdraws pending Google work; workers recheck paid access", async () => {
  for (const id of ["paused", "cancelled-subscription"]) {
    await fixture(id);
    await google(id);
    await saveSchedule(id, id, "google", preferences, beforeDue);
  }
  const result = await queueDueSchedules(due);
  assert.equal(result.refreshes.length, 2);
  await saveSchedule(
    "paused",
    "paused",
    "google",
    { ...preferences, frequency: "off" },
    due,
  );
  await db
    .prepare(
      "UPDATE billing SET status='inactive' WHERE owner_id='cancelled-subscription'",
    )
    .run();
  let calls = 0;
  const refresh = async () => {
    calls++;
    return { errors: [] };
  };
  for (const id of result.refreshes)
    assert.equal(await runGoogleRefresh(id, refresh), "done");
  assert.equal(calls, 0);
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM automation_runs WHERE owner_id='paused'")
        .get()
    ).status,
    "cancelled",
  );
  assert.equal(
    (
      await db
        .prepare(
          "SELECT status FROM automation_runs WHERE owner_id='cancelled-subscription'",
        )
        .get()
    ).status,
    "attention",
  );
});
test("refresh leases prevent duplicate calls and save partial provider errors honestly", async () => {
  await fixture("leased");
  await google("leased");
  await saveSchedule("leased", "leased", "google", preferences, beforeDue);
  const result = await queueDueSchedules(due);
  const id = result.refreshes[0];
  assert.ok(id);
  let release!: () => void;
  let begun!: () => void;
  const started = new Promise<void>((r) => (begun = r));
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const work = runGoogleRefresh(id, async () => {
    calls++;
    begun();
    await gate;
    return { errors: ["Analytics permission was revoked."] };
  });
  await started;
  assert.equal(
    await runGoogleRefresh(id, async () => {
      calls++;
      return { errors: [] };
    }),
    "busy",
  );
  release();
  await work;
  assert.equal(
    await runGoogleRefresh(id, async () => {
      calls++;
      return { errors: [] };
    }),
    "done",
  );
  assert.equal(calls, 1);
  assert.equal(
    (await db.prepare("SELECT status FROM automation_runs WHERE id=?").get(id))
      .status,
    "attention",
  );
  assert.match(
    (await listSchedules("leased", "leased"))[0].error!,
    /permission/,
  );
});
