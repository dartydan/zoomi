import { start } from "workflow/api";
import { auditWebsite } from "../workflows/audit";
import { db } from "./database";
export async function dispatchJob(id: string) {
  try {
    const run = await start(auditWebsite, [id]);
    await db
      .prepare("UPDATE jobs SET workflow_id=? WHERE id=?")
      .run(run.runId, id);
  } catch {
    // The database row is the outbox. Cron recovers a dispatch interrupted by a
    // transient platform error; deterministic hooks reject duplicate runs.
    await db
      .prepare("UPDATE jobs SET error=? WHERE id=? AND status='queued'")
      .run("Your audit is queued while the background service reconnects.", id);
  }
}

export async function dispatchRefresh(id: string) {
  const { refreshGoogle } = await import("../workflows/google");
  try {
    await start(refreshGoogle, [id]);
  } catch {
    await db
      .prepare(
        "UPDATE automation_runs SET error=? WHERE id=? AND status='queued'",
      )
      .run(
        "Your data refresh is queued while the background service reconnects.",
        id,
      );
  }
}

export async function dispatchSeo(id: string) {
  const { refreshSeo } = await import("../workflows/seo");
  try {
    await start(refreshSeo, [id]);
  } catch {
    await db
      .prepare("UPDATE seo_jobs SET error=? WHERE id=? AND status='queued'")
      .run(
        "Your research is queued while the background service reconnects.",
        id,
      );
  }
}
