import test from "node:test";
import assert from "node:assert/strict";
import { analyzePage, buildFindings, healthScore } from "../server/analyze.ts";
import { isPublicIp, normalizeUrl, safeFetch } from "../server/network.ts";
import { crawl } from "../server/crawler.ts";
import type { ResponseData } from "../server/network.ts";
const healthy =
  '<html><head><title>A useful page</title><meta name="description" content="Useful details."><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>A useful page</h1><p>Something useful.</p><img src="a.jpg" alt="A garden"></body></html>';

test("blocks private, loopback, metadata, and IPv4-mapped IPv6 addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
    "224.0.0.1",
    "192.0.2.1",
  ])
    assert.equal(isPublicIp(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(isPublicIp(address), true, address);
});
test("rejects credentials, local names, and custom ports", () => {
  for (const url of [
    "http://user:secret@example.com",
    "http://example.com:8080",
    "http://localhost",
    "http://service.local",
    "http://metadata.internal",
  ])
    assert.throws(() => normalizeUrl(url));
  assert.equal(normalizeUrl("example.com/#about").href, "https://example.com/");
});
test("network fetch blocks localhost even if it resolves successfully", async () => {
  await assert.rejects(
    () => safeFetch("http://127.0.0.1/"),
    /publicly accessible/,
  );
});
test("healthy page passes and decorative alt text is not flagged", () => {
  const p = analyzePage(
    healthy.replace('alt="A garden"', 'alt=""'),
    "https://example.com/",
  );
  assert.equal(p.missingAlt, 0);
  assert.equal(p.wordCount, 5);
  assert.deepEqual(buildFindings([p]), []);
  assert.equal(healthScore([p], []), 100);
});
test("finds missing metadata, absent alt text, invalid JSON-LD and noindex header", () => {
  const p = analyzePage(
    '<html><head><script type="application/ld+json">invalid</script></head><body><img src="x"></body></html>',
    "https://example.com/",
    200,
    "noindex, nofollow",
  );
  const ids = buildFindings([p]).map((f) => f.id);
  for (const id of [
    "missing-title",
    "missing-description",
    "missing-h1",
    "missing-alt",
    "viewport",
    "invalid-schema",
    "noindex",
  ])
    assert.ok(ids.includes(id), id);
  assert.ok(healthScore([p], buildFindings([p])) < 100);
});
test("recognizes robots none and case-insensitive metadata names", () => {
  const p = analyzePage(
    '<meta name="Robots" content="none"><meta name="Description" content="Hello">',
    "https://example.com/",
  );
  assert.equal(p.noindex, true);
  assert.equal(p.description, "Hello");
});
test("only discovers same-origin HTML candidates without query strings", () => {
  const p = analyzePage(
    `${healthy}<a href="/about#team">Team</a><a href="/report.pdf">PDF</a><a href="https://other.test/">Other</a><a href="/?logout=true">Log out</a><a href="mailto:x@y.com">Email</a><a href="/cdn-cgi/l/email-protection#1234">Protected email</a>`,
    "https://example.com/",
  );
  assert.deepEqual(p.links, ["https://example.com/about"]);
});
test("duplicate titles are grouped across pages, with evidence", () => {
  const pages = [
    analyzePage(healthy, "https://example.com/"),
    analyzePage(healthy, "https://example.com/about"),
  ];
  const findings = buildFindings(pages);
  assert.equal(findings[0].id, "duplicate-title");
  assert.equal(findings[0].urls.length, 2);
  assert.equal(healthScore(pages, findings), 92);
});
test("HTTP errors produce one actionable group without treating their body as metadata", () => {
  const p = analyzePage("Not found", "https://example.com/missing", 404);
  assert.deepEqual(
    buildFindings([p]).map((f) => f.id),
    ["broken-pages"],
  );
  assert.throws(() => healthScore([], []));
});
function fixtures(
  map: Record<string, Partial<ResponseData>>,
  calls: string[],
): typeof safeFetch {
  return async (url) => {
    calls.push(url);
    const value = map[url];
    if (!value) throw new Error(`Unexpected fetch: ${url}`);
    return {
      url,
      status: 200,
      body: healthy,
      type: "text/html",
      headers: {},
      ...value,
    };
  };
}
test("crawler respects robots exclusions, page cap and final evidence", async () => {
  const calls: string[] = [];
  const fetcher = fixtures(
    {
      "https://example.com/sitemap.xml": { status: 404 },
      "https://example.com/robots.txt": {
        body: "User-agent: *\nDisallow: /private",
        type: "text/plain",
      },
      "https://example.com/": {
        body:
          healthy +
          '<a href="/private">Private</a><a href="/about">About</a><a href="/other">Other</a>',
      },
      "https://example.com/about": {
        body: healthy.replace("A useful page", "About us"),
      },
    },
    calls,
  );
  const result = await crawl("https://example.com", fetcher, 2);
  assert.equal(result.pages.length, 2);
  assert.equal(result.skipped[0].reason, "Excluded by robots.txt");
  assert.ok(!calls.some((u) => u.endsWith("/private")));
  assert.ok(!calls.some((u) => u.endsWith("/other")));
});
test("crawler checks new-origin robots before following a homepage redirect", async () => {
  const calls: string[] = [];
  const fetcher = fixtures(
    {
      "https://example.com/robots.txt": { status: 404, body: "" },
      "https://example.com/": {
        status: 301,
        headers: { location: "https://www.example.com/" },
      },
      "https://www.example.com/robots.txt": {
        body: "User-agent: *\nDisallow: /",
      },
    },
    calls,
  );
  await assert.rejects(() => crawl("example.com", fetcher), /robots.txt/);
  assert.deepEqual(calls, [
    "https://example.com/robots.txt",
    "https://example.com/",
    "https://www.example.com/robots.txt",
  ]);
});
test("crawler stops on unavailable robots or non-HTML starting content", async () => {
  await assert.rejects(
    () =>
      crawl(
        "example.com",
        fixtures({ "https://example.com/robots.txt": { status: 503 } }, []),
      ),
    /not allowing/,
  );
  await assert.rejects(
    () =>
      crawl(
        "example.com",
        fixtures(
          {
            "https://example.com/robots.txt": { status: 404 },
            "https://example.com/": { type: "application/pdf" },
          },
          [],
        ),
      ),
    /not an HTML/,
  );
});

test("sitemap discovery crawls beyond twelve pages and reports remaining coverage", async () => {
  const calls: string[] = [];
  const map: Record<string, Partial<ResponseData>> = {
    "https://example.com/robots.txt": { status: 404, body: "" },
    "https://example.com/": { body: healthy },
    "https://example.com/sitemap.xml": {
      type: "application/xml",
      body: `<urlset>${Array.from({ length: 20 }, (_, i) => `<url><loc>https://example.com/page-${i}</loc></url>`).join("")}</urlset>`,
    },
  };
  for (let i = 0; i < 20; i++)
    map[`https://example.com/page-${i}`] = {
      body: healthy.replace("A useful page", `Page ${i}`),
    };
  const result = await crawl("example.com", fixtures(map, calls), 15);
  assert.equal(result.pages.length, 15);
  assert.equal(result.coverage?.remaining, 6);
  assert.equal(result.coverage?.partial, true);
  assert.equal(result.coverage?.discovered, 21);
});
test("a crawl resumes its checkpoint without fetching already analyzed pages", async () => {
  const root = analyzePage(healthy, "https://example.com/");
  const calls: string[] = [];
  const result = await crawl(
    "example.com",
    fixtures(
      {
        "https://example.com/robots.txt": { status: 404 },
        "https://example.com/about": { body: healthy },
      },
      calls,
    ),
    100,
    {
      resume: {
        url: root.url,
        origin: "https://example.com",
        queue: ["https://example.com/about"],
        seen: [root.url],
        pages: [root],
        skipped: [],
        attempts: 1,
        discovered: 2,
        sitemapsLoaded: true,
      },
    },
  );
  assert.equal(result.pages.length, 2);
  assert.ok(!calls.includes(root.url));
  assert.equal(result.coverage?.remaining, 0);
});

test("interrupted page fetch stays queued and can resume after shutdown", async () => {
  const controller = new AbortController();
  const root = analyzePage(healthy, "https://example.com/");
  const resume = {
    url: root.url,
    origin: "https://example.com",
    queue: ["https://example.com/about"],
    seen: [root.url],
    pages: [root],
    skipped: [],
    attempts: 1,
    discovered: 2,
    sitemapsLoaded: true,
  };
  const fetcher: typeof safeFetch = async (url) => {
    if (url.endsWith("/robots.txt"))
      return { url, status: 404, body: "", type: "text/plain", headers: {} };
    controller.abort();
    throw new Error("Stopped for restart");
  };
  await assert.rejects(
    () =>
      crawl("example.com", fetcher, 100, { resume, signal: controller.signal }),
    /Stopped/,
  );
  assert.deepEqual(resume.queue, ["https://example.com/about"]);
  assert.deepEqual(resume.seen, [root.url]);
  assert.equal(resume.skipped.length, 0);
  const result = await crawl(
    "example.com",
    fixtures(
      {
        "https://example.com/robots.txt": { status: 404 },
        "https://example.com/about": { body: healthy },
      },
      [],
    ),
    100,
    { resume },
  );
  assert.equal(result.pages.length, 2);
  assert.equal(result.coverage?.partial, false);
});
