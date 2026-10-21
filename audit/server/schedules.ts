import { randomUUID } from "node:crypto";
import { db, ownedProject } from "./database";
import { entitled } from "./billing";
import { enqueue } from "./jobs";
import { limits } from "./config";
import { nextOccurrence, validRecurrence, type Recurrence } from "./recurrence";
import { enqueueSeo } from "./seo-jobs";
import { researchReady } from "./seo-provider";
export type ScheduleKind = "audit" | "google" | "ranks";
interface Schedule extends Recurrence {
  project_id: string;
  owner_id: string;
  kind: ScheduleKind;
  page_limit: number;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}
export const scheduleView = (s: Schedule) => ({
  kind: s.kind,
  frequency: s.frequency,
  timezone: s.timezone,
  hour: s.hour,
  weekday: s.weekday,
  pageLimit: s.page_limit,
  nextRunAt: s.next_run_at,
  lastRunAt: s.last_run_at,
  status: s.last_status,
  error: s.last_error,
});
export async function listSchedules(owner: string, project: string) {
  const rows = (await db
    .prepare(
      "SELECT * FROM schedules WHERE owner_id=? AND project_id=? ORDER BY kind",
    )
    .all(owner, project)) as Schedule[];
  return rows.map(scheduleView);
}
export async function saveSchedule(
  owner: string,
  project: string,
  kind: ScheduleKind,
  input: unknown,
  now = new Date(),
) {
  if (!["audit", "google", "ranks"].includes(kind))
    throw new Error("Unknown schedule.");
  const values = validRecurrence(input);
  const pageLimit = Number(
    (input as Record<string, unknown>).pageLimit ?? limits.pages,
  );
  if (
    !Number.isInteger(pageLimit) ||
    pageLimit < 100 ||
    pageLimit > limits.pages
  )
    throw new Error(`Choose between 100 and ${limits.pages} pages.`);
  return db.transaction(async () => {
    const p = await ownedProject(owner, project);
    if (!p) throw new Error("Website not found.");
    // Preferences can be saved before subscription/collector activation. The worker
    // checks current access again before doing any work.
    const next = nextOccurrence(values, now);
    await db
      .prepare(
        `INSERT INTO schedules(project_id,owner_id,kind,frequency,timezone,hour,weekday,page_limit,next_run_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,kind) DO UPDATE SET frequency=excluded.frequency,timezone=excluded.timezone,hour=excluded.hour,weekday=excluded.weekday,page_limit=excluded.page_limit,next_run_at=excluded.next_run_at,last_error=NULL,last_status=NULL,updated_at=excluded.updated_at`,
      )
      .run(
        project,
        owner,
        kind,
        values.frequency,
        values.timezone,
        values.hour,
        values.weekday,
        pageLimit,
        next,
        now.toISOString(),
      );
    // Pausing also withdraws scheduled refreshes which have not begun yet.
    if (values.frequency === "off")
      await db
        .prepare(
          "UPDATE automation_runs SET status='cancelled',updated_at=? WHERE project_id=? AND owner_id=? AND kind=? AND status='queued'",
        )
        .run(now.toISOString(), project, owner, kind);
    return listSchedules(owner, project);
  }, `jobs:${owner}`)();
}
export async function queueDueSchedules(now = new Date()) {
  const due = await db
    .prepare(
      "SELECT project_id,owner_id,kind FROM schedules WHERE frequency<>'off' AND next_run_at<=? ORDER BY next_run_at LIMIT 50",
    )
    .all(now.toISOString());
  const result: { audits: string[]; refreshes: string[]; research: string[] } =
    {
      audits: [],
      refreshes: [],
      research: [],
    };
  for (const row of due) {
    const queued = await db.transaction(async () => {
      const s = (await db
        .prepare(
          "SELECT * FROM schedules WHERE project_id=? AND owner_id=? AND kind=?",
        )
        .get(row.project_id, row.owner_id, row.kind)) as Schedule | undefined;
      if (
        !s?.next_run_at ||
        s.frequency === "off" ||
        s.next_run_at > now.toISOString()
      )
        return;
      const p = await ownedProject(s.owner_id, s.project_id);
      let reason = "";
      let retryAt = new Date(now.getTime() + 86400000).toISOString();
      if (!p) return;
      if (!(await entitled(s.owner_id)))
        reason =
          "An active subscription is needed. We will check again tomorrow.";
      else if ((s.kind === "audit" || s.kind === "ranks") && !p.verified_at)
        reason = "Verify this website before its scheduled checks can run.";
      else if (s.kind === "ranks" && !researchReady())
        reason =
          "Direct search-result collection is not active yet. Your schedule is saved but no rank check was run.";
      else if (
        s.kind === "ranks" &&
        !(await db
          .prepare(
            "SELECT id FROM tracked_keywords WHERE project_id=? AND owner_id=? AND active=true",
          )
          .get(p.id, s.owner_id))
      )
        reason =
          "Add at least one active keyword before scheduling rank checks.";
      else if (s.kind === "google") {
        const c = await db
          .prepare(
            "SELECT gsc_site,ga_property FROM connections WHERE project_id=? AND owner_id=?",
          )
          .get(p.id, s.owner_id);
        if (!c?.gsc_site && !c?.ga_property)
          reason =
            "Connect a Search Console or Analytics property to refresh its data.";
      }
      let id: string | undefined;
      let queuedStatus = "queued";
      if (!reason) {
        if (s.kind === "audit") {
          if (
            await db
              .prepare(
                "SELECT id FROM jobs WHERE owner_id=? AND status IN ('queued','running')",
              )
              .get(s.owner_id)
          ) {
            reason = "Waiting for your current crawl to finish.";
            retryAt = new Date(now.getTime() + 10 * 60000).toISOString();
          } else {
            // enqueue uses the same owner lock for scheduled and manual quotas.
            try {
              id = (await enqueue(s.owner_id, p, s.page_limit, now)).id;
            } catch (error) {
              if (
                !(error instanceof Error) ||
                !error.message.includes("monthly crawl allowance")
              )
                throw error;
              reason = error.message;
              retryAt = nextOccurrence(
                s,
                new Date(
                  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1,
                ),
              )!;
            }
          }
        } else if (s.kind === "ranks") {
          if (
            await db
              .prepare(
                "SELECT id FROM seo_jobs WHERE owner_id=? AND status IN ('queued','running')",
              )
              .get(s.owner_id)
          ) {
            reason = "Waiting for your current search-data check to finish.";
            retryAt = new Date(now.getTime() + 10 * 60000).toISOString();
          } else {
            const job = await enqueueSeo(s.owner_id, p, "ranks", {}, now);
            id = job.id;
            queuedStatus = job.status;
          }
        } else {
          const pending = await db
            .prepare(
              "SELECT id FROM automation_runs WHERE project_id=? AND kind='google' AND status IN ('queued','running')",
            )
            .get(p.id);
          if (pending) {
            reason = "Waiting for your current data refresh to finish.";
            retryAt = new Date(now.getTime() + 10 * 60000).toISOString();
          } else {
            id = randomUUID();
            const created = await db
              .prepare(
                "INSERT INTO automation_runs(id,project_id,owner_id,kind,due_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?) ON CONFLICT(project_id,kind,due_at) DO NOTHING RETURNING id",
              )
              .get(
                id,
                p.id,
                s.owner_id,
                s.kind,
                s.next_run_at,
                now.toISOString(),
                now.toISOString(),
              );
            id = created?.id;
          }
        }
      }
      await db
        .prepare(
          "UPDATE schedules SET next_run_at=?,last_run_at=?,last_status=?,last_error=?,updated_at=? WHERE project_id=? AND kind=?",
        )
        .run(
          reason ? retryAt : nextOccurrence(s, now),
          reason ? s.last_run_at : now.toISOString(),
          reason ? "waiting" : queuedStatus,
          reason || null,
          now.toISOString(),
          p.id,
          s.kind,
        );
      return id ? { id, kind: s.kind } : undefined;
    }, `jobs:${row.owner_id}`)();
    if (queued)
      (queued.kind === "audit"
        ? result.audits
        : queued.kind === "ranks"
          ? result.research
          : result.refreshes
      ).push(queued.id);
  }
  return result;
}
export async function runGoogleRefresh(
  id: string,
  refresh?: typeof import("./google").syncMetrics,
): Promise<"done" | "busy"> {
  const token = randomUUID();
  const row = await db
    .prepare(
      "UPDATE automation_runs SET status='running',lease_token=?,lease_until=?,updated_at=? WHERE id=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<?) RETURNING *",
    )
    .get(
      token,
      Date.now() + 5 * 60000,
      new Date().toISOString(),
      id,
      Date.now(),
    );
  if (!row) {
    const current = await db
      .prepare("SELECT status FROM automation_runs WHERE id=?")
      .get(id);
    return current && ["queued", "running"].includes(current.status)
      ? "busy"
      : "done";
  }
  let error: string | null = null;
  try {
    const p = await ownedProject(row.owner_id, row.project_id);
    if (!p || !(await entitled(row.owner_id)))
      throw new Error(
        "An active subscription is needed to refresh this website automatically.",
      );
    const s = await db
      .prepare("SELECT frequency FROM schedules WHERE project_id=? AND kind=?")
      .get(p.id, row.kind);
    if (!s || s.frequency === "off")
      throw new Error("Automatic data refresh is paused.");
    const sync = refresh ?? (await import("./google")).syncMetrics;
    const data = await sync(row.owner_id, p);
    if (Array.isArray(data.errors) && data.errors.length)
      error = data.errors.join(" ");
  } catch (e) {
    error =
      e instanceof Error
        ? e.message
        : "The data refresh failed. Reconnect Google and try again.";
  }
  await db.transaction(async () => {
    const changed = await db
      .prepare(
        "UPDATE automation_runs SET status=?,error=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND status='running'",
      )
      .run(
        error ? "attention" : "complete",
        error,
        new Date().toISOString(),
        id,
        token,
      );
    if (changed.changes)
      await db
        .prepare(
          "UPDATE schedules SET last_status=?,last_error=? WHERE project_id=? AND owner_id=? AND kind=? AND last_run_at<=?",
        )
        .run(
          error ? "attention" : "complete",
          error,
          row.project_id,
          row.owner_id,
          row.kind,
          row.created_at,
        );
  }, `jobs:${row.owner_id}`)();
  return "done";
}
export async function markRefreshFailed(id: string) {
  const row = await db
    .prepare("SELECT owner_id FROM automation_runs WHERE id=?")
    .get(id);
  if (!row) return;
  const message =
    "The refresh could not finish after repeated attempts. Reconnect Google or try a manual refresh.";
  await db.transaction(async () => {
    const failed = await db
      .prepare(
        "UPDATE automation_runs SET status='failed',error=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status IN ('queued','running') RETURNING *",
      )
      .get(message, new Date().toISOString(), id);
    if (failed)
      await db
        .prepare(
          "UPDATE schedules SET last_status='failed',last_error=? WHERE project_id=? AND owner_id=? AND kind=? AND last_run_at<=?",
        )
        .run(
          message,
          failed.project_id,
          failed.owner_id,
          failed.kind,
          failed.created_at,
        );
  }, `jobs:${row.owner_id}`)();
}
