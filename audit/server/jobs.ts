import { randomUUID } from "node:crypto";
import { db, type ProjectRow } from "./database.ts";
import { crawl, type CrawlState } from "./crawler.ts";
import { limits } from "./config.ts";
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
export function enqueue(owner: string, p: ProjectRow, pageLimit: number) {
  return db.transaction(() => {
    const active = db
      .prepare(
        "SELECT id FROM jobs WHERE owner_id=? AND status IN ('queued','running')",
      )
      .get(owner);
    if (active)
      throw new Error(
        "Your existing audit must finish before starting another.",
      );
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const used = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM jobs WHERE owner_id=? AND created_at>=?",
        )
        .get(owner, start.toISOString()) as { n: number }
    ).n;
    if (used >= limits.crawlsPerMonth)
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO jobs VALUES(@id,@project_id,@owner_id,@status,@page_limit,@pages_done,@discovered,@checkpoint,@error,@created_at,@updated_at)",
    ).run(job);
    return jobView(job);
  })();
}
let working = false;
let controller: AbortController | undefined;
export function recoverJobs() {
  db.prepare("UPDATE jobs SET status='queued' WHERE status='running'").run();
}
export async function workOne() {
  if (working) return;
  const job = db
    .prepare(
      "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
    )
    .get() as Job | undefined;
  if (!job) return;
  working = true;
  controller = new AbortController();
  const claimed = db
    .prepare(
      "UPDATE jobs SET status='running',updated_at=? WHERE id=? AND status='queued'",
    )
    .run(new Date().toISOString(), job.id);
  if (!claimed.changes) {
    working = false;
    return;
  }
  try {
    const p = db
      .prepare("SELECT * FROM projects WHERE id=? AND owner_id=?")
      .get(job.project_id, job.owner_id) as ProjectRow | undefined;
    if (!p?.verified_at)
      throw new Error("Website ownership must be verified before crawling.");
    let savedAt = 0;
    const audit = await crawl(p.url, undefined, job.page_limit, {
      resume: job.checkpoint
        ? (JSON.parse(job.checkpoint) as CrawlState)
        : undefined,
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(6 * 60 * 60 * 1000),
      ]),
      cancelled: () => {
        const current = db
          .prepare("SELECT status FROM jobs WHERE id=?")
          .get(job.id) as { status: string };
        return current.status === "cancelled";
      },
      checkpoint: (state) => {
        const now = Date.now();
        if (
          now - savedAt > 3000 ||
          state.pages.length >= job.page_limit ||
          !state.queue.length
        ) {
          db.prepare(
            "UPDATE jobs SET checkpoint=?,pages_done=?,discovered=?,updated_at=? WHERE id=? AND status='running'",
          ).run(
            JSON.stringify(state),
            state.pages.length,
            state.discovered,
            new Date().toISOString(),
            job.id,
          );
          savedAt = now;
        }
      },
    });
    const status = db
      .prepare("SELECT status FROM jobs WHERE id=?")
      .get(job.id) as { status: string };
    if (status.status !== "cancelled")
      db.transaction(() => {
        db.prepare("INSERT INTO audits VALUES(?,?,?,?,?)").run(
          audit.id,
          p.id,
          job.owner_id,
          audit.createdAt,
          JSON.stringify(audit),
        );
        db.prepare(
          "UPDATE jobs SET status=?,checkpoint=NULL,pages_done=?,discovered=?,updated_at=? WHERE id=?",
        ).run(
          audit.coverage?.partial ? "partial" : "complete",
          audit.pages.length,
          audit.coverage?.discovered ?? audit.pages.length,
          new Date().toISOString(),
          job.id,
        );
      })();
  } catch (error) {
    const stopped = controller.signal.aborted;
    db.prepare(
      "UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=? AND status<>'cancelled'",
    ).run(
      stopped ? "queued" : "failed",
      stopped ? null : error instanceof Error ? error.message : "Audit failed",
      new Date().toISOString(),
      job.id,
    );
  } finally {
    working = false;
    controller = undefined;
  }
}
export function stopWorker() {
  controller?.abort();
}
