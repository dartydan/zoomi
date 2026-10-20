import { randomUUID } from "node:crypto";
import { db, type ProjectRow } from "./database.ts";
import { crawlBatch, type CrawlState } from "./crawler.ts";
import { limits } from "./config.ts";
import { entitled } from "./billing.ts";
import { safeFetch } from "./network.ts";
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
});
export async function enqueue(
  owner: string,
  p: ProjectRow,
  pageLimit: number,
  now = new Date(),
) {
  return db.transaction(async () => {
    if (
      await db
        .prepare(
          "SELECT id FROM jobs WHERE owner_id=? AND status IN ('queued','running')",
        )
        .get(owner)
    )
      throw new Error(
        "Your existing audit must finish before starting another.",
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
      throw new Error("Your monthly audit allowance has been used.");
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
    };
    await db
      .prepare(
        "INSERT INTO jobs(id,project_id,owner_id,status,page_limit,pages_done,discovered,checkpoint,error,created_at,updated_at) VALUES(@id,@project_id,@owner_id,@status,@page_limit,@pages_done,@discovered,@checkpoint,@error,@created_at,@updated_at)",
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
    let savedAt = 0;
    const save = async (state: CrawlState) => {
      const changed = await db
        .prepare(
          "UPDATE jobs SET checkpoint=?,pages_done=?,discovered=?,updated_at=? WHERE id=? AND status='running' AND lease_token=?",
        )
        .run(
          JSON.stringify(state),
          state.pages.length,
          state.discovered,
          new Date().toISOString(),
          id,
          token,
        );
      if (!changed.changes)
        throw new Error("Audit was cancelled or resumed by another worker.");
      savedAt = Date.now();
    };
    const result = await crawlBatch(p.url, fetcher, job.page_limit, {
      resume: job.checkpoint ? JSON.parse(job.checkpoint) : undefined,
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
      if (claimed.changes) {
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
