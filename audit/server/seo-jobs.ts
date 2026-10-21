import { db, ownedProject, type ProjectRow } from "./database";
import { entitled } from "./billing";
import { collectionPending, type ProviderTransport } from "./seo-provider";
import type { SeoJob, SeoKind } from "../src/seo-types";
interface Row {
  id: string;
  owner_id: string;
  project_id: string;
  kind: SeoKind;
  status: SeoJob["status"];
  params: string;
  tasks: string;
  parts: string;
  period_key: string;
  total: number;
  done: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  lease_token: string | null;
  lease_until: number | null;
}
export function jobView(row: Row, detail = false): SeoJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    params: JSON.parse(row.params),
    total: row.total,
    done: row.done,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(detail ? { parts: JSON.parse(row.parts) } : {}),
  };
}
export async function getSeoJob(owner: string, project: string, id: string) {
  const r = await db
    .prepare(
      "SELECT * FROM seo_jobs WHERE id=? AND owner_id=? AND project_id=?",
    )
    .get(id, owner, project);
  return r ? jobView(r, true) : null;
}
export async function listSeoJobs(
  owner: string,
  project: string,
  kind: SeoKind,
) {
  return (
    await db
      .prepare(
        "SELECT * FROM seo_jobs WHERE owner_id=? AND project_id=? AND kind=? ORDER BY created_at DESC LIMIT 30",
      )
      .all(owner, project, kind)
  ).map((r) => jobView(r));
}
export function validKind(value: unknown): SeoKind {
  if (
    typeof value !== "string" ||
    !["ranks", "backlinks", "discover", "competitor"].includes(value)
  )
    throw new Error("Choose a supported research type.");
  return value as SeoKind;
}
// Legacy reports remain readable, but no new aggregator jobs are admitted.
export async function enqueueSeo(
  owner: string,
  project: ProjectRow,
  _kind: unknown,
  _input: any = {},
  _now = new Date(),
): Promise<SeoJob> {
  if (!(await ownedProject(owner, project.id)))
    throw new Error("Website not found.");
  if (!(await entitled(owner)))
    throw new Error("An active subscription is needed to run search research.");
  throw new Error(collectionPending);
}
export async function runSeoStep(
  id: string,
  _send?: ProviderTransport,
): Promise<"more" | "busy" | "done"> {
  await failSeo(id, collectionPending);
  return "done";
}
export async function failSeo(
  id: string,
  message = "The background check stopped. Completed sections are saved; a fresh check can run tomorrow.",
  token?: string,
) {
  const row = await db
    .prepare("SELECT owner_id FROM seo_jobs WHERE id=?")
    .get(id);
  if (!row) return;
  await db.transaction(async () => {
    const failed = await db
      .prepare(
        `UPDATE seo_jobs SET status='failed',error=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status IN ('queued','running')${token ? " AND lease_token=?" : ""} RETURNING *`,
      )
      .get(message, new Date().toISOString(), id, ...(token ? [token] : []));
    if (failed?.kind === "ranks")
      await db
        .prepare(
          "UPDATE schedules SET last_status='failed',last_error=? WHERE project_id=? AND owner_id=? AND kind='ranks' AND last_run_at<=?",
        )
        .run(message, failed.project_id, failed.owner_id, failed.created_at);
  }, `jobs:${row.owner_id}`)();
}
export async function cancelSeo(owner: string, project: string, id: string) {
  await db
    .prepare(
      "UPDATE seo_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND owner_id=? AND project_id=? AND status IN ('queued','running')",
    )
    .run(new Date().toISOString(), id, owner, project);
  return getSeoJob(owner, project, id);
}
