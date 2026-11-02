import { randomUUID } from "node:crypto";
import type { OAuth2Client } from "google-auth-library";
import { db, ownedProject, type ProjectRow } from "./database";
import { entitled } from "./billing";
import {
  connection,
  googleClient,
  googleReady,
  matchesSearchProperty,
} from "./google";

export const rankSource = "search-console";
export const rankConnectionNeeded =
  "Connect a matching Google Search Console property in Connections to monitor daily average positions.";
export async function ranksReady(owner: string, project: string) {
  return googleReady() && !!(await connection(owner, project))?.gsc_site;
}
export function rankWindow(now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const midnight = Date.parse(today + "T00:00:00Z");
  const day = (ago: number) =>
    new Date(midnight - ago * 86400000).toISOString().slice(0, 10);
  return { startDate: day(30), endDate: day(3) };
}
const countries: Record<string, string> = {
  "United States": "USA",
  "United Kingdom": "GBR",
  Canada: "CAN",
  Australia: "AUS",
};
export function rankRequest(
  keyword: { keyword_key: string; country: string; device: string },
  window: ReturnType<typeof rankWindow>,
) {
  if (
    !Object.hasOwn(countries, keyword.country) ||
    !["desktop", "mobile"].includes(keyword.device)
  )
    throw new Error("Unsupported keyword location or device.");
  return {
    startDate: window.startDate,
    endDate: window.endDate,
    type: "web",
    dataState: "final",
    dimensions: ["date"],
    aggregationType: "byProperty",
    rowLimit: 100,
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [
          {
            dimension: "query",
            operator: "includingRegex",
            expression: `(?i)^${keyword.keyword_key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          },
          {
            dimension: "country",
            operator: "equals",
            expression: countries[keyword.country],
          },
          {
            dimension: "device",
            operator: "equals",
            expression: keyword.device.toUpperCase(),
          },
        ],
      },
    ],
  };
}
export function parsePositions(
  data: any,
  window: ReturnType<typeof rankWindow>,
) {
  if (
    !data ||
    typeof data !== "object" ||
    (data.rows !== undefined && !Array.isArray(data.rows))
  )
    throw new Error("Search Console returned invalid position data.");
  const rows = new Map<
    string,
    { position: number; clicks: number; impressions: number }
  >();
  for (const row of data.rows ?? []) {
    const day = row?.keys?.[0];
    if (
      typeof day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      day < window.startDate ||
      day > window.endDate ||
      new Date(day).toISOString().slice(0, 10) !== day ||
      row.keys.length !== 1 ||
      rows.has(day) ||
      !Number.isFinite(row.position) ||
      row.position < 1 ||
      !Number.isInteger(row.clicks) ||
      row.clicks < 0 ||
      !Number.isInteger(row.impressions) ||
      row.impressions < 1 ||
      row.clicks > row.impressions
    )
      throw new Error("Search Console returned invalid position data.");
    rows.set(day, {
      position: row.position,
      clicks: row.clicks,
      impressions: row.impressions,
    });
  }
  const result = [];
  for (
    let time = Date.parse(window.startDate);
    time <= Date.parse(window.endDate);
    time += 86400000
  ) {
    const day = new Date(time).toISOString().slice(0, 10);
    // Missing query data is unknown, not an absent rank or a zero-impression day.
    result.push({
      day,
      ...(rows.get(day) ?? { position: null, clicks: null, impressions: null }),
    });
  }
  return result;
}
export async function enqueueRanks(
  owner: string,
  project: ProjectRow,
  now: Date,
) {
  return db.transaction(async () => {
    const p = await ownedProject(owner, project.id);
    if (!p?.verified_at)
      throw new Error("Verify this website before monitoring positions.");
    const c = await connection(owner, p.id);
    if (
      !googleReady() ||
      !c?.gsc_site ||
      !matchesSearchProperty(c.gsc_site, p.url)
    )
      throw new Error(rankConnectionNeeded);
    const period = `${rankSource}:${p.id}:${c.revision}:${now.toISOString().slice(0, 10)}`;
    const prior = await db
      .prepare("SELECT id FROM seo_jobs WHERE period_key=?")
      .get(period);
    if (prior) return prior.id as string;
    if (
      await db
        .prepare(
          "SELECT id FROM seo_jobs WHERE owner_id=? AND status IN ('queued','running')",
        )
        .get(owner)
    )
      throw new Error("Wait for your current rank refresh to finish.");
    const keywords = await db
      .prepare(
        "SELECT id,keyword_key,country,device FROM tracked_keywords WHERE owner_id=? AND project_id=? AND active=true ORDER BY id",
      )
      .all(owner, p.id);
    if (!keywords.length) throw new Error("Add an active keyword first.");
    const id = randomUUID(),
      stamp = now.toISOString();
    const params = {
      source: rankSource,
      revision: c.revision,
      site: c.gsc_site,
      day: stamp.slice(0, 10),
      ...rankWindow(now),
    };
    await db
      .prepare(
        "INSERT INTO seo_jobs(id,project_id,owner_id,kind,status,params,tasks,period_key,total,created_at,updated_at) VALUES(?,?,?,'ranks','queued',?,?,?,?,?,?)",
      )
      .run(
        id,
        p.id,
        owner,
        JSON.stringify(params),
        JSON.stringify(keywords),
        period,
        keywords.length,
        stamp,
        stamp,
      );
    return id;
  }, `jobs:${owner}`)();
}
export async function runRankStep(
  id: string,
  requester?: Pick<OAuth2Client, "request">,
): Promise<"more" | "busy" | "done"> {
  const initial = await db.prepare("SELECT * FROM seo_jobs WHERE id=?").get(id);
  if (!initial || !["queued", "running"].includes(initial.status))
    return "done";
  const token = randomUUID();
  const row = await db.transaction(
    async () =>
      db
        .prepare(
          "UPDATE seo_jobs SET status='running',lease_token=?,lease_until=?,updated_at=? WHERE id=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<?) RETURNING *",
        )
        .get(
          token,
          Date.now() + 120000,
          new Date().toISOString(),
          id,
          Date.now(),
        ),
    `jobs:${initial.owner_id}`,
  )();
  if (!row) return "busy";
  const params = JSON.parse(row.params),
    task = JSON.parse(row.tasks)[row.done];
  let observations: ReturnType<typeof parsePositions> = [],
    error: string | null = null;
  try {
    const p = await ownedProject(row.owner_id, row.project_id);
    const c = await connection(row.owner_id, row.project_id);
    if (
      params.source !== rankSource ||
      !p?.verified_at ||
      !(await entitled(row.owner_id)) ||
      !c?.gsc_site ||
      c.revision !== params.revision ||
      c.gsc_site !== params.site ||
      !matchesSearchProperty(c.gsc_site, p.url)
    )
      throw new Error(
        "Website access or Google connection changed. Reconnect before refreshing positions.",
      );
    if (!task) throw new Error("No keyword remains in this refresh.");
    const oauth =
      requester ?? (await googleClient(row.owner_id, row.project_id));
    const response = await oauth.request({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.gsc_site)}/searchAnalytics/query`,
      method: "POST",
      data: rankRequest(task, params),
      timeout: 20000,
    });
    observations = parsePositions(response.data, params);
  } catch {
    // OAuth errors can contain credentials or provider payloads. Keep them server-side.
    error =
      "Position refresh failed. Check your subscription, website verification and Search Console connection, then try again tomorrow.";
  }
  return db.transaction(async () => {
    const current = await db
      .prepare(
        "SELECT * FROM seo_jobs WHERE id=? AND lease_token=? AND status='running' FOR UPDATE",
      )
      .get(id, token);
    if (!current) return "done";
    // Lock the connection row so disconnect/rebind cannot race a late write.
    const c = await db
      .prepare(
        "SELECT * FROM connections WHERE owner_id=? AND project_id=? FOR UPDATE",
      )
      .get(row.owner_id, row.project_id);
    if (
      !c ||
      c.revision !== params.revision ||
      !(await entitled(row.owner_id)) ||
      !(await ownedProject(row.owner_id, row.project_id))?.verified_at
    )
      error =
        "Website access or the Google connection changed during this refresh. No new positions were saved.";
    const stamp = new Date().toISOString();
    if (!error)
      for (const o of observations) {
        await db
          .prepare(
            `INSERT INTO search_positions(keyword_id,project_id,owner_id,revision,day,position,clicks,impressions,checked_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(keyword_id,day) DO UPDATE SET revision=excluded.revision,position=excluded.position,clicks=excluded.clicks,impressions=excluded.impressions,checked_at=excluded.checked_at WHERE search_positions.checked_at<=excluded.checked_at`,
          )
          .run(
            task.id,
            row.project_id,
            row.owner_id,
            params.revision,
            o.day,
            o.position,
            o.clicks,
            o.impressions,
            stamp,
          );
      }
    if (!error)
      await db
        .prepare("DELETE FROM search_positions WHERE keyword_id=? AND day<?")
        .run(
          task.id,
          new Date(Date.parse(params.endDate) - 89 * 86400000)
            .toISOString()
            .slice(0, 10),
        );
    const done = error ? row.done : row.done + 1;
    const status = error ? "failed" : done >= row.total ? "complete" : "queued";
    await db
      .prepare(
        "UPDATE seo_jobs SET done=?,status=?,error=?,updated_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
      )
      .run(done, status, error, stamp, id, token);
    if (status !== "queued")
      await db
        .prepare(
          "UPDATE schedules SET last_status=?,last_error=? WHERE project_id=? AND owner_id=? AND kind='ranks' AND last_run_at<=?",
        )
        .run(status, error, row.project_id, row.owner_id, row.created_at);
    return status === "queued" ? "more" : "done";
  }, `jobs:${row.owner_id}`)();
}
export async function positionHistory(
  owner: string,
  project: string,
  keyword: string,
) {
  if (
    !(await db
      .prepare(
        "SELECT id FROM tracked_keywords WHERE id=? AND owner_id=? AND project_id=?",
      )
      .get(keyword, owner, project))
  )
    throw new Error("Tracked keyword not found.");
  return db
    .prepare(
      `SELECT r.day,r.position,r.clicks,r.impressions,r.checked_at AS "checkedAt" FROM search_positions r JOIN connections c ON c.project_id=r.project_id AND c.owner_id=r.owner_id AND c.revision=r.revision WHERE r.keyword_id=? AND r.owner_id=? AND r.project_id=? ORDER BY r.day DESC LIMIT 90`,
    )
    .all(keyword, owner, project);
}
