import type { NextApiRequest, NextApiResponse } from "next";
import { timingSafeEqual } from "node:crypto";
export const config = { maxDuration: 300 };
export default async function recover(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const actual = String(req.headers.authorization ?? "");
  if (
    req.method !== "GET" ||
    !process.env.CRON_SECRET ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return res.status(401).end();
  const { db } = await import("../../server/database");
  const { dispatchJob, dispatchRefresh } =
    await import("../../server/dispatch");
  const { queueDueSchedules } = await import("../../server/schedules");
  const scheduled = await queueDueSchedules();
  for (const id of scheduled.audits) await dispatchJob(id);
  for (const id of scheduled.refreshes) await dispatchRefresh(id);
  const jobs = await db
    .prepare(
      "SELECT id FROM jobs WHERE status IN ('queued','running') AND updated_at<? AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT 25",
    )
    .all(new Date(Date.now() - 10 * 60_000).toISOString(), Date.now());
  for (const job of jobs) await dispatchJob(job.id);
  const refreshes = await db
    .prepare(
      "SELECT id FROM automation_runs WHERE status IN ('queued','running') AND updated_at<? AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT 25",
    )
    .all(new Date(Date.now() - 10 * 60000).toISOString(), Date.now());
  for (const r of refreshes) await dispatchRefresh(r.id);
  res.json({
    checked: jobs.length,
    refreshes: refreshes.length,
    scheduled: scheduled.audits.length + scheduled.refreshes.length,
  });
}
