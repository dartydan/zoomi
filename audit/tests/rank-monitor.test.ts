import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "audit-rank-monitor-"));
Object.assign(process.env, {
  AUDIT_DATA_DIR: dir,
  DATABASE_URL: "",
  GOOGLE_CLIENT_ID: "fixture",
  GOOGLE_CLIENT_SECRET: "fixture",
});
const { db } = await import("../server/database");
const {
  rankWindow,
  rankRequest,
  parsePositions,
  runRankStep,
  positionHistory,
} = await import("../server/rank-monitor");
const { saveKeyword, listKeywords, history } = await import("../server/seo");
const { enqueueSeo, getSeoJob, cancelSeo } = await import("../server/seo-jobs");
const { disconnect } = await import("../server/google");
const { saveSchedule, queueDueSchedules } = await import("../server/schedules");
const now = new Date("2026-10-22T12:00:00Z");
const term = {
  keyword: "C++ (Garden)",
  country: "United States",
  device: "mobile",
};
async function fixture(id: string) {
  await db
    .prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?)")
    .run(
      id,
      id,
      "Rank monitor fixture",
      "https://example.com/",
      "fixture",
      now.toISOString(),
      now.toISOString(),
    );
  await db
    .prepare("INSERT INTO billing(owner_id,status,updated_at) VALUES(?,?,?)")
    .run(id, "active", now.toISOString());
  await db
    .prepare(
      "INSERT INTO connections(project_id,owner_id,tokens,gsc_site,revision,updated_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      id,
      id,
      "fixture",
      "sc-domain:example.com",
      "revision1",
      now.toISOString(),
    );
  const keyword = await saveKeyword(id, id, term);
  return {
    p: await db.prepare("SELECT * FROM projects WHERE id=?").get(id),
    keyword,
  };
}
const requester = (fn: (options: any) => Promise<any>) =>
  ({ request: fn }) as any;
const response = {
  data: {
    rows: [
      { keys: ["2026-10-19"], position: 4.25, clicks: 2, impressions: 20 },
      { keys: ["2026-10-18"], position: 8.5, clicks: 0, impressions: 10 },
    ],
  },
};
after(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});
test("rank queries use Pacific reporting days, exact escaped keywords and primary-source filters", () => {
  assert.deepEqual(rankWindow(new Date("2026-10-22T02:00:00Z")), {
    startDate: "2026-09-21",
    endDate: "2026-10-18",
  });
  const request = rankRequest(
    { keyword_key: "c++ (garden)", country: "United States", device: "mobile" },
    rankWindow(now),
  );
  assert.equal(request.dataState, "final");
  assert.deepEqual(request.dimensions, ["date"]);
  const filters = request.dimensionFilterGroups[0].filters;
  assert.equal(filters[0].expression, "(?i)^c\\+\\+ \\(garden\\)$");
  assert.equal(filters[1].expression, "USA");
  assert.equal(filters[2].expression, "MOBILE");
  assert.throws(
    () =>
      rankRequest(
        { keyword_key: "garden", country: "__proto__", device: "mobile" },
        rankWindow(now),
      ),
    /Unsupported/,
  );
});
test("daily parsing preserves missing values and rejects invalid or duplicate measurements", () => {
  const rows = parsePositions(response.data, rankWindow(now));
  assert.equal(rows.length, 28);
  assert.equal(rows[0].position, null);
  assert.equal(rows.at(-1)?.position, 4.25);
  assert.equal(rows.at(-2)?.clicks, 0);
  assert.equal(
    parsePositions({}, rankWindow(now)).every(
      (r) => r.position === null && r.impressions === null,
    ),
    true,
  );
  for (const bad of [
    { rows: "bad" },
    { rows: [response.data.rows[0], response.data.rows[0]] },
    { rows: [{ ...response.data.rows[0], position: NaN }] },
    { rows: [{ ...response.data.rows[0], impressions: -1 }] },
  ])
    assert.throws(() => parsePositions(bad, rankWindow(now)), /invalid/);
});
test("rank refresh is resumable, deduplicated, private, and separate from historical SERP snapshots", async () => {
  const { p, keyword } = await fixture("positions");
  await saveKeyword(p.id, p.id, { ...term, keyword: "gardens" });
  const job = await enqueueSeo(p.id, p, "ranks", {}, now);
  assert.equal((await enqueueSeo(p.id, p, "ranks", {}, now)).id, job.id);
  let calls = 0;
  const send = requester(async (options) => {
    calls++;
    assert.deepEqual(Object.keys(options.data).sort(), [
      "aggregationType",
      "dataState",
      "dimensionFilterGroups",
      "dimensions",
      "endDate",
      "rowLimit",
      "startDate",
      "type",
    ]);
    assert.match(
      options.url,
      /^https:\/\/www.googleapis.com\/webmasters\/v3\/sites\/sc-domain%3Aexample.com\/searchAnalytics\/query$/,
    );
    return response;
  });
  assert.equal(await runRankStep(job.id, send), "more");
  assert.equal(await runRankStep(job.id, send), "done");
  assert.equal(await runRankStep(job.id, send), "done");
  assert.equal(calls, 2);
  assert.equal((await getSeoJob(p.id, p.id, job.id))?.status, "complete");
  assert.equal((await positionHistory(p.id, p.id, keyword))[0].position, 4.25);
  assert.equal((await listKeywords(p.id, p.id))[0].positions[1].position, 8.5);
  assert.equal((await history(p.id, p.id, keyword)).length, 0);
  await assert.rejects(
    () => positionHistory("other", p.id, keyword),
    /not found/,
  );
  await disconnect(p.id, p.id, async () => {});
  assert.equal((await positionHistory(p.id, p.id, keyword)).length, 0);
});
test("cancellation, disconnect and a changed connection fence late responses", async () => {
  for (const action of ["cancel", "disconnect", "rebind", "unpaid"] as const) {
    const { p, keyword } = await fixture(action);
    const job = await enqueueSeo(p.id, p, "ranks", {}, now);
    await runRankStep(
      job.id,
      requester(async () => {
        if (action === "cancel") await cancelSeo(p.id, p.id, job.id);
        if (action === "disconnect")
          await disconnect(p.id, p.id, async () => {});
        if (action === "rebind")
          await db
            .prepare(
              "UPDATE connections SET revision='changed' WHERE project_id=?",
            )
            .run(p.id);
        if (action === "unpaid")
          await db
            .prepare("UPDATE billing SET status='inactive' WHERE owner_id=?")
            .run(p.id);
        return response;
      }),
    );
    assert.equal((await positionHistory(p.id, p.id, keyword)).length, 0);
  }
});
test("a leased refresh cannot double-send, and failures preserve earlier positions without exposing credentials", async () => {
  const { p, keyword } = await fixture("failure");
  const first = await enqueueSeo(p.id, p, "ranks", {}, now);
  await runRankStep(
    first.id,
    requester(async () => response),
  );
  const saved = await positionHistory(p.id, p.id, keyword);
  const job = await enqueueSeo(
    p.id,
    p,
    "ranks",
    {},
    new Date("2026-10-23T12:00:00Z"),
  );
  await db
    .prepare("UPDATE seo_jobs SET lease_until=? WHERE id=?")
    .run(Date.now() + 60000, job.id);
  let calls = 0;
  const send = requester(async () => {
    calls++;
    throw new Error("secret-access-token");
  });
  assert.equal(await runRankStep(job.id, send), "busy");
  assert.equal(calls, 0);
  await db
    .prepare("UPDATE seo_jobs SET lease_until=NULL WHERE id=?")
    .run(job.id);
  await runRankStep(job.id, send);
  assert.equal((await getSeoJob(p.id, p.id, job.id))?.status, "failed");
  assert.doesNotMatch(
    (await getSeoJob(p.id, p.id, job.id))?.error ?? "",
    /secret-access-token/,
  );
  assert.deepEqual(await positionHistory(p.id, p.id, keyword), saved);
});
test("connected rank schedules create direct Google work and inactive subscriptions block admission", async () => {
  const { p } = await fixture("schedule-ranks");
  await saveSchedule(
    p.id,
    p.id,
    "ranks",
    {
      frequency: "daily",
      timezone: "UTC",
      hour: 13,
      weekday: 1,
      pageLimit: 100,
    },
    now,
  );
  const due = await queueDueSchedules(new Date("2026-10-22T13:00:00Z"));
  assert.equal(due.research.length, 1);
  assert.equal(
    (await getSeoJob(p.id, p.id, due.research[0]))?.params.source,
    "search-console",
  );
  await db
    .prepare("UPDATE billing SET status='inactive' WHERE owner_id=?")
    .run(p.id);
  await assert.rejects(
    () => enqueueSeo(p.id, p, "ranks", {}, now),
    /subscription/,
  );
});
