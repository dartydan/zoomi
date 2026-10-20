import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { safeFetch } from "../server/network";
import { crawlBatch } from "../server/crawler";
const dir = mkdtempSync(join(tmpdir(), "audit-jobs-"));
process.env.AUDIT_DATA_DIR = dir;
process.env.DATABASE_URL = "";
const { db } = await import("../server/database");
const { enqueue, runBatch } = await import("../server/jobs");
const now = new Date().toISOString();
const project = {
  id: "p",
  owner_id: "owner",
  name: "Website",
  url: "https://example.com/",
  verification_token: "test",
  verified_at: now,
  created_at: now,
};
await db
  .prepare(
    "INSERT INTO projects VALUES(@id,@owner_id,@name,@url,@verification_token,@verified_at,@created_at)",
  )
  .run(project);
after(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});
let pagesFetched = 0;
const fetcher: typeof safeFetch = async (url) => {
  const path = new URL(url).pathname;
  const body =
    path === "/robots.txt"
      ? "User-agent: *\nCrawl-delay: 0"
      : path === "/sitemap.xml"
        ? "<urlset>" +
          Array.from(
            { length: 5 },
            (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`,
          ).join("") +
          "</urlset>"
        : `<html><head><title>${path}</title></head><body><h1>${path}</h1></body></html>`;
  if (path !== "/robots.txt" && path !== "/sitemap.xml") pagesFetched++;
  return {
    url,
    status: 200,
    type: path.endsWith(".xml")
      ? "application/xml"
      : path.endsWith(".txt")
        ? "text/plain"
        : "text/html",
    body,
    headers: {},
  };
};
test("concurrent audit requests reserve one allowance and one active job", async () => {
  const result = await Promise.allSettled([
    enqueue("owner", project, 100),
    enqueue("owner", project, 100),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    Number((await db.prepare("SELECT COUNT(*) n FROM jobs").get()).n),
    1,
  );
});
test("batches resume durable checkpoints and duplicate completion creates one report", async () => {
  const job = await db.prepare("SELECT id FROM jobs").get();
  assert.equal(await runBatch(job.id, fetcher, 2), "more");
  const first = await db.prepare("SELECT * FROM jobs WHERE id=?").get(job.id);
  assert.equal(first.status, "queued");
  assert.ok(first.checkpoint);
  assert.equal(first.pages_done, 1);
  let state = "more";
  for (let i = 0; i < 10 && state === "more"; i++)
    state = await runBatch(job.id, fetcher, 2);
  assert.equal(state, "done");
  const row = await db
    .prepare("SELECT data FROM audits WHERE id=?")
    .get(job.id);
  assert.equal(JSON.parse(row.data).pages.length, 6);
  const fetched = pagesFetched;
  assert.equal(await runBatch(job.id, fetcher), "done");
  assert.equal(pagesFetched, fetched);
  assert.equal(
    Number((await db.prepare("SELECT COUNT(*) n FROM audits").get()).n),
    1,
  );
});
test("leases block duplicate workers; expired leases resume and cancellation wins", async () => {
  const job = await enqueue("owner", project, 100);
  await db
    .prepare(
      "UPDATE jobs SET status='running',lease_token='old',lease_until=? WHERE id=?",
    )
    .run(Date.now() + 60000, job.id);
  assert.equal(await runBatch(job.id, fetcher), "busy");
  await db.prepare("UPDATE jobs SET lease_until=0 WHERE id=?").run(job.id);
  assert.equal(await runBatch(job.id, fetcher, 2), "more");
  await db.prepare("UPDATE jobs SET status='cancelled' WHERE id=?").run(job.id);
  assert.equal(await runBatch(job.id, fetcher), "done");
  assert.equal(
    await db.prepare("SELECT id FROM audits WHERE id=?").get(job.id),
    undefined,
  );
});
test("sitemap indexes resume across batches without dropping later sitemap files", async () => {
  const fetcher2: typeof safeFetch = async (url) => {
    if (url.endsWith("/sitemap.xml"))
      return {
        url,
        status: 200,
        type: "application/xml",
        headers: {},
        body:
          "<sitemapindex>" +
          [1, 2, 3]
            .map(
              (i) =>
                `<sitemap><loc>https://example.com/map${i}.xml</loc></sitemap>`,
            )
            .join("") +
          "</sitemapindex>",
      };
    if (/map[123].xml$/.test(url))
      return {
        url,
        status: 200,
        type: "application/xml",
        headers: {},
        body: `<urlset><url><loc>https://example.com/page${url.match(/map(\d)/)![1]}</loc></url></urlset>`,
      };
    return fetcher(url);
  };
  let batch = await crawlBatch(project.url, fetcher2, 100, {
    batchRequests: 1,
  });
  assert.equal(batch.done, false);
  assert.equal(batch.state.sitemapsLoaded, false);
  for (let i = 0; i < 20 && !batch.done; i++)
    batch = await crawlBatch(project.url, fetcher2, 100, {
      resume: batch.state,
      batchRequests: 1,
    });
  assert.equal(batch.done, true);
  assert.equal(batch.audit?.pages.length, 4);
});
