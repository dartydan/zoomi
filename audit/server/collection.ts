import { randomUUID } from "node:crypto";
import { db, ownedProject } from "./database";
import { limits } from "./config";
import { seoDomain } from "./seo-provider";
import { normalizeUrl } from "./network";
import type { PageResult } from "../src/types";
import type {
  CollectionSource,
  CollectedLink,
  CollectedPage,
  CollectionPage,
} from "../src/collection-types";

// Project-private evidence collected by Zoomi. Customer analytics are never
// copied into a shared index. This is a crawl observation, not a search rank.
export async function indexPages(
  owner: string,
  project: string,
  pages: PageResult[],
) {
  for (const page of pages) {
    if (
      !page.outgoingLinks ||
      !page.observedAt ||
      !(
        (page.status >= 200 && page.status < 300) ||
        [404, 410].includes(page.status)
      )
    )
      continue;
    const domain = seoDomain(page.url),
      stamp = page.observedAt;
    const written = await db
      .prepare(
        `INSERT INTO collected_pages(project_id,owner_id,url,domain,title,description,headings,word_count,status,noindex,links_truncated,first_seen,last_seen)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,url) DO UPDATE SET title=excluded.title,description=excluded.description,headings=excluded.headings,word_count=excluded.word_count,status=excluded.status,noindex=excluded.noindex,links_truncated=excluded.links_truncated,last_seen=excluded.last_seen
      WHERE collected_pages.last_seen<=excluded.last_seen RETURNING url`,
      )
      .get(
        project,
        owner,
        page.url,
        domain,
        page.title.slice(0, 1000),
        page.description.slice(0, 2000),
        JSON.stringify(page.h1.slice(0, 20).map((h) => h.slice(0, 500))),
        page.wordCount,
        page.status,
        page.noindex,
        !!page.outgoingLinksTruncated,
        stamp,
        stamp,
      );
    if (!written) continue;
    const links =
      page.status < 300
        ? page.outgoingLinks.flatMap((link) => {
            try {
              return [
                {
                  target_url: normalizeUrl(link.url).href,
                  target_domain: seoDomain(link.url),
                  anchor: link.anchor,
                  rel: JSON.stringify(link.rel),
                },
              ];
            } catch {
              return [];
            }
          })
        : [];
    if (!page.outgoingLinksTruncated || [404, 410].includes(page.status)) {
      // Only an actually re-fetched source page can prove a link disappeared.
      // Skips, robots denials, timeouts and truncated pages cannot mark links lost.
      await db
        .prepare(
          `UPDATE collected_links SET present=false,last_checked=? WHERE owner_id=? AND project_id=? AND source_url=? AND last_checked<=? AND target_url NOT IN (SELECT value FROM jsonb_array_elements_text(?::jsonb))`,
        )
        .run(
          stamp,
          owner,
          project,
          page.url,
          stamp,
          JSON.stringify(links.map((l) => l.target_url)),
        );
    }
    if (links.length)
      await db
        .prepare(
          `INSERT INTO collected_links(project_id,owner_id,source_url,target_url,source_domain,target_domain,anchor,rel,first_seen,last_seen,last_checked,present)
      SELECT ?,?,?,x.target_url,?,x.target_domain,x.anchor,x.rel,?,?,?,true FROM jsonb_to_recordset(?::jsonb) AS x(target_url text,target_domain text,anchor text,rel text)
      ON CONFLICT(project_id,source_url,target_url) DO UPDATE SET anchor=excluded.anchor,rel=excluded.rel,last_seen=excluded.last_seen,last_checked=excluded.last_checked,present=true WHERE collected_links.last_checked<=excluded.last_checked`,
        )
        .run(
          project,
          owner,
          page.url,
          domain,
          stamp,
          stamp,
          stamp,
          JSON.stringify(links),
        );
  }
}
export async function sources(
  owner: string,
  project: string,
): Promise<CollectionSource[]> {
  const p = await ownedProject(owner, project);
  if (!p) throw new Error("Website not found.");
  const saved = await db
    .prepare(
      "SELECT domain,url FROM collection_sources WHERE owner_id=? AND project_id=? ORDER BY created_at",
    )
    .all(owner, project);
  const rivals = await db
    .prepare(
      "SELECT domain FROM competitors WHERE owner_id=? AND project_id=? ORDER BY created_at",
    )
    .all(owner, project);
  const stats = await db
    .prepare(
      "SELECT domain,COUNT(*) n,MAX(last_seen) last FROM collected_pages WHERE owner_id=? AND project_id=? GROUP BY domain",
    )
    .all(owner, project);
  const all: Omit<CollectionSource, "pages" | "lastSeen">[] = [
    { domain: seoDomain(p.url), url: p.url, kind: "website" },
    ...rivals.map((c) => ({
      domain: c.domain,
      url: `https://${c.domain}/`,
      kind: "competitor" as const,
    })),
    ...saved.map((c) => ({
      domain: c.domain,
      url: c.url,
      kind: "source" as const,
    })),
  ];
  return all
    .filter((s, i) => all.findIndex((t) => t.domain === s.domain) === i)
    .map((s) => {
      const stat = stats.find((t) => t.domain === s.domain);
      return {
        ...s,
        pages: Number(stat?.n ?? 0),
        lastSeen: stat?.last ?? null,
      };
    });
}
export async function saveSource(
  owner: string,
  project: string,
  value: unknown,
) {
  const domain = seoDomain(value);
  const input = normalizeUrl(String(value));
  if (input.search)
    throw new Error("Enter a public website or page without query parameters.");
  return db.transaction(async () => {
    const all = await sources(owner, project);
    if (all.some((s) => s.domain === domain)) return;
    if (all.filter((s) => s.kind === "source").length >= 25)
      throw new Error(
        "You can save up to 25 additional source websites per project.",
      );
    await db
      .prepare(
        "INSERT INTO collection_sources(id,project_id,owner_id,domain,url,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,domain) DO NOTHING",
      )
      .run(
        randomUUID(),
        project,
        owner,
        domain,
        input.href,
        new Date().toISOString(),
      );
  }, `sources:${project}`)();
}
export function pageOffset(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0 || n > 10_000_000)
    throw new Error("Choose a valid result page.");
  return n;
}
export async function collectedLinks(
  owner: string,
  project: string,
  state: unknown,
  offset: number,
): Promise<CollectionPage<CollectedLink>> {
  const p = await ownedProject(owner, project);
  if (!p) throw new Error("Website not found.");
  if (state !== "present" && state !== "missing")
    throw new Error("Choose observed or missing links.");
  const target = seoDomain(p.url);
  // Exact domain or real subdomain; never example.com.evil.test or notexample.com.
  const where =
    "owner_id=? AND project_id=? AND (target_domain=? OR right(target_domain,length(?)+1)='.'||?) AND NOT(source_domain=? OR right(source_domain,length(?)+1)='.'||?) AND present=?";
  const args = [
    owner,
    project,
    target,
    target,
    target,
    target,
    target,
    target,
    state === "present",
  ];
  const total = Number(
    (
      await db
        .prepare(`SELECT COUNT(*) n FROM collected_links WHERE ${where}`)
        .get(...args)
    ).n,
  );
  const rows = await db
    .prepare(
      `SELECT * FROM collected_links WHERE ${where} ORDER BY last_checked DESC,source_url,target_url LIMIT 100 OFFSET ?`,
    )
    .all(...args, offset);
  return {
    items: rows.map((r) => ({
      sourceUrl: r.source_url,
      targetUrl: r.target_url,
      sourceDomain: r.source_domain,
      anchor: r.anchor,
      rel: JSON.parse(r.rel),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      lastChecked: r.last_checked,
      present: r.present,
    })),
    total,
    offset,
    next: offset + 100 < total ? offset + 100 : null,
  };
}
export async function collectedPages(
  owner: string,
  project: string,
  domain: string,
  offset: number,
): Promise<CollectionPage<CollectedPage>> {
  if (!(await ownedProject(owner, project)))
    throw new Error("Website not found.");
  const total = Number(
    (
      await db
        .prepare(
          "SELECT COUNT(*) n FROM collected_pages WHERE owner_id=? AND project_id=? AND domain=?",
        )
        .get(owner, project, domain)
    ).n,
  );
  const rows = await db
    .prepare(
      "SELECT * FROM collected_pages WHERE owner_id=? AND project_id=? AND domain=? ORDER BY url LIMIT 100 OFFSET ?",
    )
    .all(owner, project, domain, offset);
  return {
    items: rows.map((r) => ({
      url: r.url,
      domain: r.domain,
      title: r.title,
      description: r.description,
      headings: JSON.parse(r.headings),
      wordCount: r.word_count,
      status: r.status,
      noindex: r.noindex,
      lastSeen: r.last_seen,
    })),
    total,
    offset,
    next: offset + 100 < total ? offset + 100 : null,
  };
}
export async function collectionState(owner: string, project: string) {
  const list = await sources(owner, project);
  const { jobView } = await import("./jobs");
  const jobs = await db
    .prepare(
      "SELECT * FROM jobs WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20",
    )
    .all(owner, project);
  const stats = await db
    .prepare(
      "SELECT COUNT(*) n, MAX(last_seen) last FROM collected_pages WHERE owner_id=? AND project_id=?",
    )
    .get(owner, project);
  const links = await collectedLinks(owner, project, "present", 0);
  return {
    sources: list,
    jobs: jobs.map(jobView),
    pages: Number(stats.n),
    links: links.total,
    lastSeen: stats.last,
    pageLimit: limits.pages,
    monthlyCrawls: limits.crawlsPerMonth,
  };
}
