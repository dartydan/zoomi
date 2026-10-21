import { randomUUID } from "node:crypto";
import { db, ownedProject, type ProjectRow } from "./database.ts";
import { crawlBatch, type CrawlState } from "./crawler.ts";
import { limits } from "./config.ts";
import { entitled } from "./billing.ts";
import { safeFetch } from "./network.ts";
import { indexPages, sources } from "./collection";
import { seoDomain } from "./seo-provider";
export interface Job {
  id: string;
  project_id: string;
  owner_id: string;
  status: string;
  page_limit: number;
  pages_done: number;
  discovered: number;
  checkpoint: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  lease_token?: string | null;
  lease_until?: number | null;
  purpose?: string;
  target_url?: string | null;
}
export const jobView = (j: Job) => ({
  id: j.id,
  projectId: j.project_id,
  status: j.status,
  pageLimit: j.page_limit,
  pagesDone: j.pages_done,
  discovered: j.discovered,
  error: j.error,
  createdAt: j.created_at,
  updatedAt: j.updated_at,
  purpose: j.purpose ?? "audit",
  targetUrl: j.target_url ?? null,
});
export async function enqueue(
  owner: string,
  p: ProjectRow,
  pageLimit: number,
  now = new Date(),
  collectionDomain?: string,
) {
  return db.transaction(async () => {
    const current = await ownedProject(owner, p.id);
    if (!current?.verified_at)
      throw new Error("Verify your website before collecting pages.");
    if (!(await entitled(owner)))
      throw new Error("An active subscription is required to collect pages.");
    if (
      !Number.isInteger(pageLimit) ||
      pageLimit < 100 ||
      pageLimit > limits.pages
    )
      throw new Error("Choose between 100 and 10,000 pages.");
    const source = collectionDomain
      ? (await sources(owner, p.id)).find((s) => s.domain === collectionDomain)
      : undefined;
    if (collectionDomain && !source)
      throw new Error("Save this source website before collecting its pages.");
    if (
      await db
        .prepare(
          "SELECT id FROM jobs WHERE owner_id=? AND status IN ('queued','running')",
        )
        .get(owner)
    )
      throw new Error(
        "Your existing crawl must finish before starting another.",
      );
    const start = new Date(now);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const used = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM jobs WHERE owner_id=? AND created_at>=?",
      )
      .get(owner, start.toISOString());
    if (Number(used.n) >= limits.crawlsPerMonth)
      throw new Error("Your monthly crawl allowance has been used.");
    const job: Job = {
      id: randomUUID(),
      project_id: p.id,
      owner_id: owner,
      status: "queued",
      page_limit: pageLimit,
      pages_done: 0,
      discovered: 0,
      checkpoint: null,
      error: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      purpose: collectionDomain ? "collection" : "audit",
      target_url: source?.url ?? current.url,
    };
    await db
      .prepare(
        "INSERT INTO jobs(id,project_id,owner_id,status,page_limit,pages_done,discovered,checkpoint,error,created_at,updated_at,purpose,target_url) VALUES(@id,@project_id,@owner_id,@status,@page_limit,@pages_done,@discovered,@checkpoint,@error,@created_at,@updated_at,@purpose,@target_url)",
      )
      .run(job);
    return jobView(job);
  }, `jobs:${owner}`)();
}

// A lease protects saved progress from duplicate workflow deliveries. Every write
// is fenced by its token; a restarted instance cannot overwrite a newer worker.
export async function runBatch(
  id: string,
  fetcher: typeof safeFetch = safeFetch,
  batchRequests = 20,
): Promise<"done" | "more" | "busy"> {
  const token = randomUUID();
  const job = (await db
    .prepare(
      `UPDATE jobs SET status='running',lease_token=?,lease_until=?,error=NULL,updated_at=?
    WHERE id=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<?) RETURNING *`,
    )
    .get(
      token,
      Date.now() + 5 * 60_000,
      new Date().toISOString(),
      id,
      Date.now(),
    )) as Job | undefined;
  if (!job) {
    const row = await db.prepare("SELECT status FROM jobs WHERE id=?").get(id);
    return row && ["queued", "running"].includes(row.status) ? "busy" : "done";
  }
  const signal = AbortSignal.timeout(180_000);
  try {
    const p = (await db
      .prepare("SELECT * FROM projects WHERE id=? AND owner_id=?")
      .get(job.project_id, job.owner_id)) as ProjectRow | undefined;
    if (!p?.verified_at)
      throw new Error("Website ownership must be verified before crawling.");
    if (!(await entitled(job.owner_id)))
      throw new Error(
        "An active subscription is required to continue this audit. Your saved progress is preserved.",
      );
    const target = job.target_url ?? p.url;
    const domain = seoDomain(target);
    if (
      job.purpose === "collection" &&
      !(await sources(job.owner_id, p.id)).some((s) => s.domain === domain)
    )
      throw new Error(
        "This collection source was removed. Start a new crawl from a saved source.",
      );
    const host = await db
      .prepare(
        "INSERT INTO crawl_host_leases(domain,token,lease_until) VALUES(?,?,?) ON CONFLICT(domain) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE crawl_host_leases.lease_until<? RETURNING token",
      )
      .get(domain, token, Date.now() + 5 * 60000, Date.now());
    if (!host) {
      await db
        .prepare(
          "UPDATE jobs SET status='queued',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        )
        .run(id, token);
      return "busy";
    }
    const resume: CrawlState | undefined = job.checkpoint
      ? JSON.parse(job.checkpoint)
      : undefined;
    let indexed = resume?.pages.length ?? 0;
    let savedAt = 0;
    const save = async (state: CrawlState) => {
      await db.transaction(async () => {
        const changed = await db
          .prepare(
            "UPDATE jobs SET checkpoint=?,pages_done=?,discovered=?,updated_at=? WHERE id=? AND status='running' AND lease_token=?",
          )
          .run(
            // Link rows are committed alongside the checkpoint below. Do not
            // duplicate the growing link graph in every resumed crawl payload.
            JSON.stringify(state, (key, value) =>
              key === "outgoingLinks" ? undefined : value,
            ),
            state.pages.length,
            state.discovered,
            new Date().toISOString(),
            id,
            token,
          );
        if (!changed.changes)
          throw new Error("Audit was cancelled or resumed by another worker.");
        await indexPages(job.owner_id, p.id, state.pages.slice(indexed));
      }, `job:${id}`)();
      for (const page of state.pages.slice(indexed)) delete page.outgoingLinks;
      indexed = state.pages.length;
      savedAt = Date.now();
    };
    const scopedFetch: typeof safeFetch = async (url, opts = {}) => {
      const within = (value: string) => seoDomain(value) === domain;
      if (job.purpose === "collection" && !within(url))
        throw new Error("Collection stays on the selected website.");
      const result = await fetcher(
        url,
        job.purpose === "collection"
          ? { ...opts, allow: (u) => within(u) && (opts.allow?.(u) ?? true) }
          : opts,
      );
      if (job.purpose === "collection" && !within(result.url))
        throw new Error("Collection redirect leaves the selected website.");
      return result;
    };
    const result = await crawlBatch(target, scopedFetch, job.page_limit, {
      resume,
      signal,
      batchRequests,
      batchMilliseconds: 45_000,
      cancelled: async () => {
        const row = await db
          .prepare("SELECT status,lease_token FROM jobs WHERE id=?")
          .get(id);
        return !row || row.status !== "running" || row.lease_token !== token;
      },
      checkpoint: async (state) => {
        if (Date.now() - savedAt > 3000) await save(state);
      },
    });
    await save(result.state);
    if (!result.done) {
      await db
        .prepare(
          "UPDATE jobs SET status='queued',lease_token=NULL,lease_until=NULL WHERE id=? AND status='running' AND lease_token=?",
        )
        .run(id, token);
      return "more";
    }
    await db.transaction(async () => {
      const claimed = await db
        .prepare(
          "UPDATE jobs SET status=?,checkpoint=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status='running' AND lease_token=?",
        )
        .run(
          result.audit!.coverage?.partial ? "partial" : "complete",
          new Date().toISOString(),
          id,
          token,
        );
      if (claimed.changes && job.purpose !== "collection") {
        // The job id is also the report id, making completion safe to retry.
        const audit = { ...result.audit!, id };
        await db
          .prepare(
            "INSERT INTO audits VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .run(id, p.id, job.owner_id, audit.createdAt, JSON.stringify(audit));
      }
    }, `job:${id}`)();
    return "done";
  } catch (error) {
    await db
      .prepare(
        "UPDATE jobs SET status=?,lease_token=NULL,lease_until=NULL,error=?,updated_at=? WHERE id=? AND status='running' AND lease_token=?",
      )
      .run(
        signal.aborted ? "queued" : "failed",
        signal.aborted
          ? null
          : error instanceof Error
            ? error.message
            : "Audit failed.",
        new Date().toISOString(),
        id,
        token,
      );
    if (signal.aborted) throw error;
    return "done";
  } finally {
    await db.prepare("DELETE FROM crawl_host_leases WHERE token=?").run(token);
  }
}
export async function markWorkflowFailed(id: string) {
  await db
    .prepare(
      "UPDATE jobs SET status='failed',error=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status IN ('queued','running')",
    )
    .run(
      "The background audit could not finish after repeated attempts. Your saved progress is preserved; contact support.",
      new Date().toISOString(),
      id,
    );
}
