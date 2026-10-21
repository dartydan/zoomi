import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "audit-seo-"));
Object.assign(process.env, {
  AUDIT_DATA_DIR: directory,
  DATABASE_URL: "",
  DATAFORSEO_LOGIN: "fixture",
  DATAFORSEO_PASSWORD: "fixture",
  DATAFORSEO_DAILY_REQUEST_LIMIT: "500",
  DATAFORSEO_USER_DAILY_REQUEST_LIMIT: "100",
  DATAFORSEO_BACKLINKS_ENABLED: "true",
});
const { db } = await import("../server/database");
const provider = await import("../server/seo-provider");
const parse = await import("../server/seo-parsers");
const seo = await import("../server/seo");
const jobs = await import("../server/seo-jobs");
const { saveSchedule, queueDueSchedules, listSchedules } = await import(
  "../server/schedules"
);
const { csvText } = await import("../src/seo-ui");
after(async () => {
  await db.close();
  rmSync(directory, { recursive: true, force: true });
});
const envelope = (r: unknown) => ({
  status_code: 20000,
  tasks: [{ status_code: 20000, result: [r] }],
});
const serp = {
  items: [
    {
      type: "paid",
      rank_group: 1,
      rank_absolute: 1,
      url: "https://example.com/ad",
    },
    {
      type: "organic",
      rank_group: 1,
      rank_absolute: 3,
      url: "https://notexample.com/",
    },
    {
      type: "organic",
      rank_group: 2,
      rank_absolute: 4,
      url: "https://example.com.evil.test/",
    },
    {
      type: "organic",
      rank_group: 3,
      rank_absolute: 5,
      url: "https://blog.example.com/article",
      title: "Article",
    },
    {
      type: "organic",
      rank_group: 4,
      rank_absolute: 6,
      url: "https://rival.com/page",
    },
    {
      type: "organic",
      rank_group: 5,
      rank_absolute: 7,
      url: "javascript:alert(1)",
    },
  ],
};
async function fixture(id: string, paid = true, verified = true) {
  const stamp = new Date().toISOString();
  await db
    .prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?)")
    .run(
      id,
      id,
      "Fixture website",
      "https://example.com/",
      "fixture",
      verified ? stamp : null,
      stamp,
    );
  await db
    .prepare("INSERT INTO billing(owner_id,status,updated_at) VALUES(?,?,?)")
    .run(id, paid ? "active" : "inactive", stamp);
  return await db.prepare("SELECT * FROM projects WHERE id=?").get(id);
}
const keyword = {
  keyword: "Garden design",
  country: "United States",
  device: "desktop",
};
test("organic positions exclude ads, use rank_group, and respect domain boundaries", () => {
  const r = parse.parseRanks(serp, "example.com", [
    "rival.com",
    "absent.example",
  ]);
  assert.equal(r.position, 3);
  assert.equal(r.organicResults, 4);
  assert.equal(r.deepestPosition, 4);
  assert.equal(r.competitors[0].position, 4);
  assert.equal(r.competitors[1].position, null);
  assert.ok(r.leadingResults.every((r) => r.url.startsWith("https://")));
  const missing = parse.parseRanks(serp, "absent.com", []);
  assert.equal(missing.position, null);
  assert.equal(missing.requestedDepth, 100);
  assert.equal(missing.deepestPosition, 4);
});
test("research preserves unknowns, validates links and reads full competitor metrics", () => {
  assert.equal(parse.parseBacklinkSummary({}).backlinks, null);
  assert.equal(
    parse.parseBacklinkSummary({ backlinks: 0, rank: NaN }).backlinks,
    0,
  );
  assert.equal(parse.parseBacklinkSummary({ rank: NaN }).rank, null);
  const links = parse.parseBacklinks({
    total_count: 2,
    items: [
      { url_from: "javascript:bad", url_to: "https://example.com/" },
      {
        url_from: "https://rival.com/a",
        url_to: "javascript:bad",
        is_lost: true,
        dofollow: false,
      },
    ],
  });
  assert.equal(links.items.length, 1);
  assert.equal(links.items[0].to, null);
  assert.equal(links.items[0].lost, true);
  assert.equal(links.items[0].dofollow, false);
  const discovery = parse.parseDiscovery({
    items: [
      {
        domain: "rival.com",
        intersections: 15,
        metrics: { organic: { etv: 12 } },
        full_domain_metrics: {
          organic: { etv: 900, count: 300, pos_1: 2, pos_2_3: 3, pos_4_10: 5 },
        },
      },
    ],
  });
  assert.equal(discovery.items[0].estimatedVisits, 900);
  assert.equal(discovery.items[0].top10, 10);
  const shared = parse.parseIntersection({
    items: [
      {
        keyword_data: { keyword: "garden" },
        first_domain_serp_element: { rank_group: 4 },
        second_domain_serp_element: { rank_group: 12 },
      },
    ],
  });
  assert.equal(shared.items[0].ownPosition, 12);
  assert.equal(shared.items[0].volume, null);
  const ranked = parse.parseRankedKeywords({
    items: [
      {
        keyword_data: { keyword: "organic" },
        ranked_serp_element: {
          serp_item: {
            type: "organic",
            rank_group: 2,
            url: "https://rival.com",
          },
        },
      },
      {
        keyword_data: { keyword: "ad" },
        ranked_serp_element: { serp_item: { type: "paid", rank_group: 1 } },
      },
    ],
  });
  assert.equal(ranked.items.length, 1);
  assert.throws(
    () =>
      provider.providerResult({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [] }],
      }),
    /No usable dataset/,
  );
});
test("CSV exports neutralize spreadsheet formulas and quote embedded commas and newlines", () => {
  const text = csvText([[' =HYPERLINK("bad")', "a,b", "hello\nworld", null]]);
  assert.ok(text.includes('"\' =HYPERLINK(""bad"")"'));
  assert.ok(text.includes('"a,b"'));
  assert.ok(text.includes('"hello\nworld"'));
});
test("retired aggregator cannot be re-enabled by credentials or an injected transport", async () => {
  let calls = 0;
  assert.equal(provider.researchReady(), false);
  assert.equal(provider.backlinksReady(), false);
  await assert.rejects(
    () =>
      provider.providerRequest(
        "owner",
        "key",
        "backlinks/summary/live",
        {},
        parse.parseBacklinkSummary,
        async () => {
          calls++;
          return envelope({});
        },
      ),
    /collects its own/,
  );
  assert.equal(calls, 0);
});
test("keyword normalization, owner isolation, country/device validation and concurrent limits", async () => {
  const p = await fixture("keywords", false, false);
  const a = await seo.saveKeyword(p.id, p.id, keyword);
  const b = await seo.saveKeyword(p.id, p.id, {
    ...keyword,
    keyword: "  GARDEN   design  ",
  });
  assert.equal(a, b);
  await seo.saveKeyword(p.id, p.id, { ...keyword, device: "mobile" });
  assert.equal((await seo.listKeywords(p.id, p.id)).length, 2);
  await assert.rejects(
    () => seo.saveKeyword(p.id, p.id, { ...keyword, country: "__proto__" }),
    /supported/,
  );
  await assert.rejects(
    () => seo.saveKeyword(p.id, p.id, { ...keyword, device: "tablet" }),
    /desktop/,
  );
  await assert.rejects(
    () => seo.setKeywordActive("other", p.id, a, false),
    /not found/,
  );
  await assert.rejects(() => seo.history("other", p.id, a), /not found/);
  for (let i = 2; i < 49; i++)
    await seo.saveKeyword(p.id, p.id, { ...keyword, keyword: "term " + i });
  const results = await Promise.allSettled([
    seo.saveKeyword(p.id, p.id, { ...keyword, keyword: "last a" }),
    seo.saveKeyword(p.id, p.id, { ...keyword, keyword: "last b" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await seo.listKeywords(p.id, p.id)).filter((k) => k.active).length,
    50,
  );
  await seo.setKeywordActive(p.id, p.id, a, false);
  await seo.saveKeyword(p.id, p.id, { ...keyword, keyword: "replacement" });
  await assert.rejects(
    () => seo.setKeywordActive(p.id, p.id, a, true),
    /Pause a keyword/,
  );
  await assert.rejects(() => jobs.enqueueSeo(p.id, p, "ranks"), /subscription/);
});
test("competitor watchlists normalize domains and enforce ownership and capacity", async () => {
  const p = await fixture("watch");
  await seo.addCompetitor(p.id, p.id, "https://www.rival.com/path");
  await seo.addCompetitor(p.id, p.id, "rival.com");
  assert.equal((await seo.listCompetitors(p.id, p.id)).length, 1);
  await assert.rejects(
    () => seo.addCompetitor(p.id, p.id, "example.com"),
    /different/,
  );
  await assert.rejects(
    () => seo.addCompetitor("other", p.id, "other.com"),
    /not found/,
  );
  for (let i = 0; i < 4; i++)
    await seo.addCompetitor(p.id, p.id, `competitor${i}.com`);
  await assert.rejects(
    () => seo.addCompetitor(p.id, p.id, "sixth.com"),
    /five/,
  );
  const c = (await seo.listCompetitors(p.id, p.id))[0];
  await seo.removeCompetitor("other", p.id, c.id);
  assert.equal((await seo.listCompetitors(p.id, p.id)).length, 5);
});
test("legacy search jobs cannot send requests and saved rank preferences remain private", async () => {
  const p = await fixture("retired");
  const id = await seo.saveKeyword(p.id, p.id, keyword);
  await assert.rejects(
    () => jobs.enqueueSeo(p.id, p, "ranks"),
    /collects its own/,
  );
  await assert.rejects(() => jobs.enqueueSeo("other", p, "ranks"), /not found/);
  const stamp = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO seo_jobs(id,project_id,owner_id,kind,status,params,tasks,period_key,total,created_at,updated_at) VALUES(?,?,?,'ranks','queued','{}','[]',?,1,?,?)",
    )
    .run("old", p.id, p.id, "old", stamp, stamp);
  let calls = 0;
  await jobs.runSeoStep("old", async () => {
    calls++;
    return envelope(serp);
  });
  assert.equal(calls, 0);
  assert.equal((await jobs.getSeoJob(p.id, p.id, "old"))?.status, "failed");
  assert.equal(await jobs.getSeoJob("other", p.id, "old"), null);
  assert.equal((await seo.history(p.id, p.id, id)).length, 0);
});
test("rank schedules explain unavailable collection without admitting provider work", async () => {
  const p = await fixture("schedule");
  await seo.saveKeyword(p.id, p.id, keyword);
  await saveSchedule(
    p.id,
    p.id,
    "ranks",
    {
      frequency: "daily",
      timezone: "UTC",
      hour: 9,
      weekday: 1,
      pageLimit: 10000,
    },
    new Date("2026-10-20T08:00:00Z"),
  );
  assert.equal(
    (await queueDueSchedules(new Date("2026-10-20T09:00:00Z"))).research.length,
    0,
  );
  assert.match(
    (await listSchedules(p.id, p.id))[0].error!,
    /Direct search-result collection/,
  );
});
