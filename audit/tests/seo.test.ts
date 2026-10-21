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
const { saveSchedule, queueDueSchedules, listSchedules } =
  await import("../server/schedules");
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
test("shared provider budget is atomic across customers; cached requests and uncertain outcomes never charge twice", async () => {
  process.env.DATAFORSEO_DAILY_REQUEST_LIMIT = "1";
  let calls = 0;
  const send = async () => {
    calls++;
    return envelope({ total_count: 0, items: [] });
  };
  const results = await Promise.allSettled([
    provider.providerRequest(
      "budget-a",
      "budget-a:key",
      "backlinks/backlinks/live",
      {},
      parse.parseBacklinks,
      send,
    ),
    provider.providerRequest(
      "budget-b",
      "budget-b:key",
      "backlinks/backlinks/live",
      {},
      parse.parseBacklinks,
      send,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(calls, 1);
  const owner = results[0].status === "fulfilled" ? "budget-a" : "budget-b";
  await provider.providerRequest(
    owner,
    owner + ":key",
    "backlinks/backlinks/live",
    {},
    parse.parseBacklinks,
    send,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      provider.providerRequest(
        owner,
        owner + ":key",
        "backlinks/backlinks/live",
        { limit: 50 },
        parse.parseBacklinks,
        send,
      ),
    /different settings/,
  );
  process.env.DATAFORSEO_DAILY_REQUEST_LIMIT = "500";
  const fail = async () => {
    calls++;
    throw new Error("Timeout after remote billing");
  };
  await assert.rejects(
    () =>
      provider.providerRequest(
        "uncertain",
        "uncertain:key",
        "backlinks/backlinks/live",
        {},
        parse.parseBacklinks,
        fail,
      ),
    /not been repeated/,
  );
  await assert.rejects(
    () =>
      provider.providerRequest(
        "uncertain",
        "uncertain:key",
        "backlinks/backlinks/live",
        {},
        parse.parseBacklinks,
        send,
      ),
    /already attempted/,
  );
  assert.equal(calls, 2);
  process.env.DATAFORSEO_USER_DAILY_REQUEST_LIMIT = "1";
  await assert.rejects(
    () =>
      provider.providerRequest(
        "uncertain",
        "uncertain:another",
        "backlinks/backlinks/live",
        {},
        parse.parseBacklinks,
        send,
      ),
    /allowance/,
  );
  process.env.DATAFORSEO_USER_DAILY_REQUEST_LIMIT = "100";
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
test("rank jobs deduplicate admission and leased execution, retain private history and replay checkpoints without charges", async () => {
  const p = await fixture("rank");
  const k = await seo.saveKeyword(p.id, p.id, keyword);
  await seo.addCompetitor(p.id, p.id, "rival.com");
  const [a, b] = await Promise.all([
    jobs.enqueueSeo(p.id, p, "ranks"),
    jobs.enqueueSeo(p.id, p, "ranks"),
  ]);
  assert.equal(a.id, b.id);
  let begin!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (begin = r)),
    gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const send = async () => {
    calls++;
    begin();
    await gate;
    return envelope(serp);
  };
  const work = jobs.runSeoStep(a.id, send);
  await started;
  assert.equal(await jobs.runSeoStep(a.id, send), "busy");
  await assert.rejects(() => seo.removeKeyword(p.id, p.id, k), /finish/);
  release();
  assert.equal(await work, "done");
  assert.equal(calls, 1);
  const records = await seo.history(p.id, p.id, k);
  assert.equal(records.length, 1);
  assert.equal(records[0].position, 3);
  assert.equal(records[0].competitors[0].position, 4);
  assert.equal(await jobs.getSeoJob("other", p.id, a.id), null);
  await db
    .prepare("UPDATE seo_jobs SET status='queued',done=0,parts='[]' WHERE id=?")
    .run(a.id);
  assert.equal(await jobs.runSeoStep(a.id, send), "done");
  assert.equal(calls, 1);
  assert.equal((await seo.history(p.id, p.id, k)).length, 1);
  assert.equal(
    (await seo.listKeywords(p.id, p.id))[0].latest?.leadingResults.length,
    0,
  );
});
test("new day adds history; adding a keyword on the same day reuses earlier keyword checks", async () => {
  const p = await fixture("history");
  const first = await seo.saveKeyword(p.id, p.id, keyword);
  let calls = 0;
  const send = async () => {
    calls++;
    return envelope(serp);
  };
  const day = new Date();
  const a = await jobs.enqueueSeo(p.id, p, "ranks", {}, day);
  await jobs.runSeoStep(a.id, send);
  await seo.saveKeyword(p.id, p.id, { ...keyword, keyword: "second" });
  const b = await jobs.enqueueSeo(p.id, p, "ranks", {}, day);
  while ((await jobs.runSeoStep(b.id, send)) === "more") {}
  assert.equal(calls, 2);
  const tomorrow = new Date(day.getTime() + 86400000);
  const c = await jobs.enqueueSeo(p.id, p, "ranks", {}, tomorrow);
  while ((await jobs.runSeoStep(c.id, send)) === "more") {}
  assert.equal(calls, 4);
  assert.equal((await seo.history(p.id, p.id, first)).length, 2);
});
test("cancelled jobs fence in-flight writes, and access revocation stops future paid tasks", async () => {
  const p = await fixture("cancel");
  await seo.saveKeyword(p.id, p.id, keyword);
  const a = await jobs.enqueueSeo(p.id, p, "ranks");
  let begin!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (begin = r)),
    gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  const work = jobs.runSeoStep(a.id, async () => {
    calls++;
    begin();
    await gate;
    return envelope(serp);
  });
  await started;
  await jobs.cancelSeo(p.id, p.id, a.id);
  release();
  await work;
  assert.equal((await jobs.getSeoJob(p.id, p.id, a.id))?.status, "cancelled");
  assert.equal((await seo.listKeywords(p.id, p.id))[0].latest, null);
  const q = await fixture("revoke");
  await seo.saveKeyword(q.id, q.id, keyword);
  const b = await jobs.enqueueSeo(q.id, q, "ranks");
  await db
    .prepare("UPDATE billing SET status='inactive' WHERE owner_id=?")
    .run(q.id);
  await jobs.runSeoStep(b.id, async () => {
    calls++;
    return envelope(serp);
  });
  assert.equal(calls, 1);
  assert.equal((await jobs.getSeoJob(q.id, q.id, b.id))?.status, "failed");
});
test("backlink reports retain completed sections when one paid request fails; access is separately gated", async () => {
  const p = await fixture("links");
  process.env.DATAFORSEO_BACKLINKS_ENABLED = "false";
  await assert.rejects(
    () => jobs.enqueueSeo(p.id, p, "backlinks"),
    /activation/,
  );
  process.env.DATAFORSEO_BACKLINKS_ENABLED = "true";
  const job = await jobs.enqueueSeo(p.id, p, "backlinks");
  let calls = 0;
  const send = async (endpoint: string, body: Record<string, unknown>) => {
    calls++;
    assert.equal(body.rank_scale, "one_hundred");
    assert.equal(body.exclude_internal_backlinks, true);
    if (endpoint.endsWith("summary/live"))
      return envelope({ backlinks: 100, referring_domains: 10, rank: 35 });
    if (endpoint.includes("referring_domains"))
      throw new Error("Account access");
    return envelope({
      total_count: 1,
      items: [
        {
          url_from: "https://rival.com/a",
          url_to: "https://example.com/",
          is_lost: body.backlinks_status_type === "lost",
        },
      ],
    });
  };
  while ((await jobs.runSeoStep(job.id, send)) === "more") {}
  const report = await jobs.getSeoJob(p.id, p.id, job.id);
  assert.equal(report?.status, "partial");
  assert.equal(report?.parts?.length, 4);
  assert.equal(
    (report?.parts?.find((p) => p.key === "lost")?.data as any).items[0].lost,
    true,
  );
  assert.ok(report?.parts?.find((p) => p.key === "domains")?.error);
  assert.equal(calls, 4);
  assert.equal(await jobs.runSeoStep(job.id, send), "done");
  assert.equal(calls, 4);
});
test("competitor profiles request real organic datasets with the correct gap direction", async () => {
  const p = await fixture("profile");
  await seo.addCompetitor(p.id, p.id, "rival.com");
  await assert.rejects(
    () =>
      jobs.enqueueSeo(p.id, p, "competitor", {
        country: "United States",
        competitor: "unknown.com",
      }),
    /watchlist/,
  );
  const a = await jobs.enqueueSeo(p.id, p, "competitor", {
    country: "United States",
    competitor: "rival.com",
  });
  let calls = 0,
    gaps = 0;
  const send = async (endpoint: string, body: Record<string, unknown>) => {
    calls++;
    assert.equal(body.location_code, 2840);
    if (endpoint.includes("intersection")) {
      assert.equal(body.target1, "rival.com");
      assert.equal(body.target2, "example.com");
      gaps++;
    }
    return envelope({ items: [], total_count: 0 });
  };
  while ((await jobs.runSeoStep(a.id, send)) === "more") {}
  assert.equal(calls, 6);
  assert.equal(gaps, 2);
  assert.equal((await jobs.getSeoJob(p.id, p.id, a.id))?.status, "complete");
  const d = await jobs.enqueueSeo(p.id, p, "discover", { country: "Canada" });
  await jobs.runSeoStep(d.id, async (endpoint, body) => {
    assert.ok(endpoint.includes("competitors_domain"));
    assert.equal(body.location_code, 2124);
    return envelope({ items: [], total_count: 0 });
  });
});
test("scheduled ranks share manual admission, recheck configuration, and pause future runs", async () => {
  const p = await fixture("schedule");
  await seo.saveKeyword(p.id, p.id, keyword);
  const start = new Date("2026-10-20T08:00:00Z"),
    due = new Date("2026-10-20T09:00:00Z");
  const preferences = {
    frequency: "daily",
    timezone: "UTC",
    hour: 9,
    weekday: 1,
    pageLimit: 10000,
  };
  await saveSchedule(p.id, p.id, "ranks", preferences, start);
  process.env.DATAFORSEO_DAILY_REQUEST_LIMIT = "0";
  assert.equal((await queueDueSchedules(due)).research.length, 0);
  assert.match((await listSchedules(p.id, p.id))[0].error!, /activation/);
  process.env.DATAFORSEO_DAILY_REQUEST_LIMIT = "500";
  await saveSchedule(p.id, p.id, "ranks", preferences, start);
  const runs = await Promise.all([
    queueDueSchedules(due),
    queueDueSchedules(due),
  ]);
  assert.equal(runs.flatMap((r) => r.research).length, 1);
  await saveSchedule(
    p.id,
    p.id,
    "ranks",
    { ...preferences, frequency: "off" },
    due,
  );
  assert.equal((await listSchedules(p.id, p.id))[0].nextRunAt, null);
  const id = runs.flatMap((r) => r.research)[0];
  await jobs.runSeoStep(id, async () => envelope(serp));
  assert.equal((await jobs.getSeoJob(p.id, p.id, id))?.status, "complete");
  await saveSchedule(p.id, p.id, "ranks", preferences, start);
  await queueDueSchedules(due);
  assert.equal((await listSchedules(p.id, p.id))[0].status, "complete");
});
