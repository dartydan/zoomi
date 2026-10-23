import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzePage } from "../server/analyze";
import type { safeFetch } from "../server/network";
const dir = mkdtempSync(join(tmpdir(), "audit-collection-"));
process.env.AUDIT_DATA_DIR = dir;
process.env.DATABASE_URL = "";
const { db } = await import("../server/database");
const collection = await import("../server/collection");
const { enqueue, runBatch } = await import("../server/jobs");
const stamp = new Date().toISOString();
async function fixture(id: string) {
  await db
    .prepare("INSERT INTO projects VALUES(?,?,?,?,?,?,?)")
    .run(id, id, "Website", "https://example.com/", "test", stamp, stamp);
  await db
    .prepare("INSERT INTO billing(owner_id,status,updated_at) VALUES(?,?,?)")
    .run(id, "active", stamp);
  return (await db.prepare("SELECT * FROM projects WHERE id=?").get(id))!;
}
after(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});
const html = `<title>Garden advice</title><h1>Design a garden</h1><a href="https://example.com/service#part"> Garden design </a><a href="https://example.com/service" rel="nofollow sponsored">Again</a><a href="https://example.com.evil.test/">Wrong</a><a href="https://notexample.com/">Wrong</a><a href="https://blog.example.com/post">Article</a><a href="javascript:alert(1)">Bad</a>`;
test("page extraction resolves base URLs, retains external link evidence and bounds attributes", () => {
  const page = analyzePage(html, "https://source.com/a");
  assert.equal(page.links.length, 0);
  assert.equal(page.outgoingLinks?.length, 4);
  assert.equal(page.outgoingLinks?.[0].anchor, "Garden design");
  assert.deepEqual(page.outgoingLinks?.[0].rel, ["nofollow", "sponsored"]);
  const base = analyzePage(
    '<base href="https://example.com/"><a href="relative">Target</a><a href="https://name:secret@example.com/">No</a>',
    "https://source.com/a",
  );
  assert.equal(base.outgoingLinks?.length, 1);
  assert.equal(base.outgoingLinks?.[0].url, "https://example.com/relative");
  const large = analyzePage(
    Array.from(
      { length: 510 },
      (_, i) => `<a href="https://example.com/${i}">${i}</a>`,
    ).join(""),
    "https://source.com/a",
  );
  assert.equal(large.outgoingLinks?.length, 500);
  assert.equal(large.outgoingLinksTruncated, true);
});
test("index uses exact domain boundaries and keeps data isolated between customers", async () => {
  const p = await fixture("index"),
    other = await fixture("other");
  const page = analyzePage(html, "https://source.com/a");
  page.observedAt = "2026-10-20T10:00:00Z";
  await db.transaction(() => collection.indexPages(p.id, p.id, [page]))();
  const found = await collection.collectedLinks(p.id, p.id, "present", 0);
  assert.equal(found.total, 2);
  assert.ok(found.items.every((l) => l.firstSeen === page.observedAt));
  assert.equal(
    (await collection.collectedLinks(other.id, other.id, "present", 0)).total,
    0,
  );
  await assert.rejects(
    () => collection.collectedLinks(other.id, p.id, "present", 0),
    /not found/,
  );
  await assert.rejects(
    () => collection.collectedPages(other.id, p.id, "source.com", 0),
    /not found/,
  );
  const pages = await collection.collectedPages(p.id, p.id, "source.com", 0);
  assert.equal(pages.items[0].title, "Garden advice");
});
test("only a successful complete page recheck proves absence; failures and truncation preserve observations", async () => {
  const p = await db.prepare("SELECT * FROM projects WHERE id='index'").get();
  const failure = analyzePage("", "https://source.com/a", 503);
  failure.observedAt = "2026-10-20T11:00:00Z";
  await db.transaction(() => collection.indexPages(p.id, p.id, [failure]))();
  assert.equal(
    (await collection.collectedLinks(p.id, p.id, "present", 0)).total,
    2,
  );
  const truncated = analyzePage("", "https://source.com/a");
  truncated.observedAt = "2026-10-20T12:00:00Z";
  truncated.outgoingLinksTruncated = true;
  await db.transaction(() => collection.indexPages(p.id, p.id, [truncated]))();
  assert.equal(
    (await collection.collectedLinks(p.id, p.id, "present", 0)).total,
    2,
  );
  const gone = analyzePage("", "https://source.com/a");
  gone.observedAt = "2026-10-20T13:00:00Z";
  await db.transaction(() => collection.indexPages(p.id, p.id, [gone]))();
  const missing = await collection.collectedLinks(p.id, p.id, "missing", 0);
  assert.equal(missing.total, 2);
  assert.equal(missing.items[0].lastSeen, "2026-10-20T10:00:00Z");
  assert.equal(missing.items[0].lastChecked, gone.observedAt);
  const stale = analyzePage(html, "https://source.com/a");
  stale.observedAt = "2026-10-20T12:00:00Z";
  await db.transaction(() => collection.indexPages(p.id, p.id, [stale]))();
  assert.equal(
    (await collection.collectedLinks(p.id, p.id, "present", 0)).total,
    0,
  );
  stale.observedAt = "2026-10-20T14:00:00Z";
  await db.transaction(() => collection.indexPages(p.id, p.id, [stale]))();
  const returned = await collection.collectedLinks(p.id, p.id, "present", 0);
  assert.equal(returned.items[0].firstSeen, "2026-10-20T10:00:00Z");
  assert.equal(returned.items[0].lastSeen, stale.observedAt);
});
const fetcher: typeof safeFetch = async (url) => ({
  url,
  status: url.endsWith("sitemap.xml") ? 404 : 200,
  type: url.endsWith("robots.txt") ? "text/plain" : "text/html",
  headers: {},
  body: url.endsWith("robots.txt") ? "User-agent: *\nCrawl-delay: 0" : html,
});
test("collection jobs share allowance and lease controls, save direct evidence and do not become own-site audits", async () => {
  const p = await fixture("jobs");
  await assert.rejects(
    () => enqueue("other", p, 100, new Date(), "source.com"),
    /Verify/,
  );
  await assert.rejects(
    () => enqueue(p.id, p, 100, new Date(), "source.com"),
    /Save this source/,
  );
  await collection.saveSource(p.id, p.id, "https://source.com/a");
  const job = await enqueue(p.id, p, 100, new Date(), "source.com");
  assert.equal(job.purpose, "collection");
  await assert.rejects(() => enqueue(p.id, p, 100), /existing crawl/);
  assert.equal(await runBatch(job.id, fetcher, 2), "done");
  assert.equal(
    (await collection.collectedLinks(p.id, p.id, "present", 0)).total,
    2,
  );
  assert.equal(
    (await collection.collectedPages(p.id, p.id, "source.com", 0)).total,
    1,
  );
  assert.equal(
    await db.prepare("SELECT id FROM audits WHERE id=?").get(job.id),
    undefined,
  );
  assert.equal(await runBatch(job.id, fetcher), "done");
  assert.equal((await collection.collectionState(p.id, p.id)).pages, 1);
});
test("robots denial, cancellation and cross-domain redirects do not manufacture backlink results", async () => {
  const p = await fixture("blocked");
  await collection.saveSource(p.id, p.id, "source.com");
  const denied = await enqueue(p.id, p, 100, new Date(), "source.com");
  let pages = 0;
  await runBatch(denied.id, async (url) => {
    if (!url.endsWith("robots.txt")) pages++;
    return { ...(await fetcher(url)), body: "User-agent: *\nDisallow: /" };
  });
  assert.equal(pages, 0);
  assert.equal((await collection.collectionState(p.id, p.id)).pages, 0);
  const redirect = await enqueue(p.id, p, 100, new Date(), "source.com");
  await runBatch(redirect.id, async (url) =>
    url.endsWith("robots.txt")
      ? fetcher(url)
      : {
          ...(await fetcher(url)),
          status: 302,
          headers: { location: "https://elsewhere.com/" },
        },
  );
  assert.equal((await collection.collectionState(p.id, p.id)).pages, 0);
  const cancelled = await enqueue(p.id, p, 100, new Date(), "source.com");
  await runBatch(cancelled.id, async (url) => {
    if (!url.endsWith("robots.txt"))
      await db
        .prepare("UPDATE jobs SET status='cancelled' WHERE id=?")
        .run(cancelled.id);
    return fetcher(url);
  });
  assert.equal((await collection.collectionState(p.id, p.id)).pages, 0);
});
test("host leases serialize different customer crawls and inactive subscriptions stop before fetching", async () => {
  const p = await fixture("host");
  await collection.saveSource(p.id, p.id, "source.com");
  const job = await enqueue(p.id, p, 100, new Date(), "source.com");
  await db
    .prepare("INSERT INTO crawl_host_leases VALUES(?,?,?)")
    .run("source.com", "another-worker", Date.now() + 60000);
  let calls = 0;
  assert.equal(
    await runBatch(job.id, async (url) => {
      calls++;
      return fetcher(url);
    }),
    "busy",
  );
  assert.equal(calls, 0);
  await db
    .prepare("DELETE FROM crawl_host_leases WHERE domain='source.com'")
    .run();
  await db
    .prepare("UPDATE billing SET status='inactive' WHERE owner_id=?")
    .run(p.id);
  assert.equal(
    await runBatch(job.id, async (url) => {
      calls++;
      return fetcher(url);
    }),
    "done",
  );
  assert.equal(calls, 0);
});

test("discovery suggestions retain observed provenance, exclude saved/internal sources and never invent backlinks", async () => {
  const p = await fixture("suggestions");
  await collection.saveSource(p.id, p.id, "https://saved.com/");
  const pages = [
    analyzePage(
      '<a href="https://new-source.com/z">New</a><a href="https://saved.com/">Saved</a><a href="https://blog.example.com/">Internal</a><a href="https://query.com/?secret=1">Query</a>',
      "https://example.com/page",
    ),
    analyzePage(
      '<a href="https://new-source.com/a">New</a>',
      "https://rival.com/article",
    ),
  ];
  await db.transaction(() => collection.indexPages(p.id, p.id, pages))();
  const suggestions = await collection.discoveryCandidates(p.id, p.id);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].domain, "new-source.com");
  assert.equal(suggestions[0].url, "https://new-source.com/a");
  assert.equal(suggestions[0].foundOn, "https://rival.com/article");
  assert.equal(suggestions[0].mentions, 2);
  assert.equal(
    (await collection.collectedLinks(p.id, p.id, "present", 0)).total,
    0,
  );
  await assert.rejects(
    () => collection.discoveryCandidates("other", p.id),
    /not found/,
  );
  await collection.saveSource(p.id, p.id, suggestions[0].url);
  assert.equal((await collection.discoveryCandidates(p.id, p.id)).length, 0);
});

test("recurring source collection rotates by attempts, respects shared quotas, and does not crawl when paused", async () => {
  const { saveSchedule, queueDueSchedules, listSchedules } = await import(
    "../server/schedules"
  );
  const p = await fixture("rotation");
  await collection.saveSource(p.id, p.id, "https://a-source.com/");
  await collection.saveSource(p.id, p.id, "https://b-source.com/");
  const recurrence = {
    frequency: "daily",
    timezone: "UTC",
    hour: 9,
    weekday: 1,
    pageLimit: 100,
  };
  await saveSchedule(
    p.id,
    p.id,
    "collection",
    recurrence,
    new Date("2026-10-20T08:00:00Z"),
  );
  const first = await queueDueSchedules(new Date("2026-10-20T09:00:00Z"));
  assert.equal(first.audits.length, 1);
  assert.equal(
    (
      await db
        .prepare("SELECT target_url FROM jobs WHERE id=?")
        .get(first.audits[0])
    ).target_url,
    "https://a-source.com/",
  );
  await db
    .prepare("UPDATE jobs SET status='failed' WHERE id=?")
    .run(first.audits[0]);
  const second = await queueDueSchedules(new Date("2026-10-21T09:00:00Z"));
  assert.equal(second.audits.length, 1);
  assert.equal(
    (
      await db
        .prepare("SELECT target_url FROM jobs WHERE id=?")
        .get(second.audits[0])
    ).target_url,
    "https://b-source.com/",
  );
  await db
    .prepare("UPDATE jobs SET status='complete' WHERE id=?")
    .run(second.audits[0]);
  assert.equal((await listSchedules(p.id, p.id))[0].status, "complete");
  for (let i = 0; i < 28; i++)
    await db
      .prepare(
        "INSERT INTO jobs(id,project_id,owner_id,status,page_limit,created_at,updated_at) VALUES(?,?,?,'complete',100,?,?)",
      )
      .run(
        `quota-${i}`,
        p.id,
        p.id,
        "2026-10-21T10:00:00Z",
        "2026-10-21T10:00:00Z",
      );
  assert.equal(
    (await queueDueSchedules(new Date("2026-10-22T09:00:00Z"))).audits.length,
    0,
  );
  assert.match((await listSchedules(p.id, p.id))[0].error!, /allowance/);
  await saveSchedule(p.id, p.id, "collection", {
    ...recurrence,
    frequency: "off",
  });
  assert.equal(
    (await queueDueSchedules(new Date("2026-11-01T09:00:00Z"))).audits.length,
    0,
  );
});
