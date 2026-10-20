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
