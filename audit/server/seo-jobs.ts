import { randomUUID } from "node:crypto";
import { db, ownedProject, type ProjectRow } from "./database";
import { entitled } from "./billing";
import {
  providerRequest,
  researchReady,
  backlinksReady,
  seoDomain,
  validCountry,
  locations,
  fingerprint,
  type ProviderTransport,
} from "./seo-provider";
import * as parsers from "./seo-parsers";
import { listKeywords, listCompetitors } from "./seo";
import type { SeoJob, SeoKind, SeoPart, RankData } from "../src/seo-types";
interface Task {
  key: string;
  label: string;
  endpoint: string;
  body: Record<string, unknown>;
  parser: string;
  keywordId?: string;
  target?: string;
  competitors?: string[];
}
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
async function tasksFor(
  owner: string,
  project: ProjectRow,
  kind: SeoKind,
  params: SeoJob["params"],
): Promise<Task[]> {
  const target = seoDomain(project.url),
    location_code = params.country ? locations[params.country] : undefined;
  const labs = "dataforseo_labs/google/";
  const region = { location_code, language_code: "en" };
  if (kind === "ranks") {
    const competitors = (await listCompetitors(owner, project.id)).map(
      (c) => c.domain,
    );
    const keywords = (await listKeywords(owner, project.id)).filter(
      (k) => k.active,
    );
    if (!keywords.length)
      throw new Error("Add at least one active keyword first.");
    return keywords.map((k) => ({
      key: k.id,
      label: `${k.keyword} · ${k.country} · ${k.device}`,
      keywordId: k.id,
      target,
      competitors,
      endpoint: "serp/google/organic/live/advanced",
      parser: "ranks",
      body: {
        keyword: k.keyword,
        location_code: locations[k.country],
        language_code: "en",
        device: k.device,
        depth: 100,
      },
    }));
  }
  if (kind === "backlinks") {
    const scope = {
      target,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      rank_scale: "one_hundred",
    };
    return [
      {
        key: "summary",
        label: "Backlink profile",
        endpoint: "backlinks/summary/live",
        parser: "summary",
        body: { ...scope, backlinks_status_type: "live" },
      },
      {
        key: "links",
        label: "Live backlinks",
        endpoint: "backlinks/backlinks/live",
        parser: "links",
        body: {
          ...scope,
          backlinks_status_type: "live",
          mode: "as_is",
          limit: 100,
          order_by: ["rank,desc"],
        },
      },
      {
        key: "domains",
        label: "Referring websites",
        endpoint: "backlinks/referring_domains/live",
        parser: "domains",
        body: {
          ...scope,
          backlinks_status_type: "live",
          limit: 100,
          order_by: ["backlinks,desc"],
        },
      },
      {
        key: "lost",
        label: "Lost backlinks",
        endpoint: "backlinks/backlinks/live",
        parser: "links",
        body: {
          ...scope,
          backlinks_status_type: "lost",
          mode: "as_is",
          limit: 100,
          order_by: ["last_seen,desc"],
        },
      },
    ];
  }
  if (kind === "discover")
    return [
      {
        key: "discover",
        label: "Organic search competitors",
        endpoint: labs + "competitors_domain/live",
        parser: "discover",
        body: {
          target,
          ...region,
          item_types: ["organic"],
          exclude_top_domains: true,
          limit: 20,
        },
      },
    ];
  const rival = params.competitor!;
  return [
    {
      key: "own",
      label: "Your search visibility",
      endpoint: labs + "domain_rank_overview/live",
      parser: "overview",
      body: { target, ...region },
    },
    {
      key: "rival",
      label: "Competitor search visibility",
      endpoint: labs + "domain_rank_overview/live",
      parser: "overview",
      body: { target: rival, ...region },
    },
    {
      key: "pages",
      label: "Strongest competitor pages",
      endpoint: labs + "relevant_pages/live",
      parser: "pages",
      body: {
        target: rival,
        ...region,
        limit: 50,
        order_by: ["metrics.organic.etv,desc"],
      },
    },
    {
      key: "keywords",
      label: "Competitor keywords",
      endpoint: labs + "ranked_keywords/live",
      parser: "keywords",
      body: {
        target: rival,
        ...region,
        limit: 100,
        filters: ["ranked_serp_element.serp_item.type", "=", "organic"],
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    },
    ...[false, true].map((shared) => ({
      key: shared ? "shared" : "missing",
      label: shared ? "Shared keywords" : "Missing keywords",
      endpoint: labs + "domain_intersection/live",
      parser: "intersection",
      body: {
        target1: rival,
        target2: target,
        ...region,
        intersections: shared,
        item_types: ["organic"],
        limit: 100,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
      },
    })),
  ];
}
export async function enqueueSeo(
  owner: string,
  project: ProjectRow,
  kindInput: unknown,
  input: any = {},
  now = new Date(),
): Promise<SeoJob> {
  const kind = validKind(kindInput);
  return db.transaction(async () => {
    const current = await ownedProject(owner, project.id);
    if (!current) throw new Error("Website not found.");
    if (!(await entitled(owner)))
      throw new Error(
        "An active subscription is needed to run search research.",
      );
    if (!current.verified_at)
      throw new Error("Verify your website before running search research.");
    if (!researchReady() || (kind === "backlinks" && !backlinksReady()))
      throw new Error(
        "Zoomi’s licensed search-data connection is awaiting activation. You can save your keywords and competitors now.",
      );
    const params: SeoJob["params"] = { day: now.toISOString().slice(0, 10) };
    if (kind === "discover" || kind === "competitor")
      params.country = validCountry(input.country);
    if (kind === "competitor") {
      params.competitor = seoDomain(input.competitor);
      if (
        !(await listCompetitors(owner, current.id)).some(
          (c) => c.domain === params.competitor,
        )
      )
        throw new Error("Save this competitor to your watchlist first.");
    }
    const tasks = await tasksFor(owner, current, kind, params);
    const periodKey = fingerprint([
      owner,
      current.id,
      kind,
      params,
      kind === "ranks" ? tasks.map((t) => t.keywordId).sort() : null,
    ]);
    const cached = await db
      .prepare("SELECT * FROM seo_jobs WHERE period_key=?")
      .get(periodKey);
    if (cached) return jobView(cached, true);
    if (
      await db
        .prepare(
          "SELECT id FROM seo_jobs WHERE owner_id=? AND status IN ('queued','running')",
        )
        .get(owner)
    )
      throw new Error(
        "Let your current search-data check finish, or cancel it, before starting another.",
      );
    const id = randomUUID(),
      stamp = now.toISOString();
    await db
      .prepare(
        "INSERT INTO seo_jobs(id,project_id,owner_id,kind,status,params,tasks,period_key,total,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?,?,?,?)",
      )
      .run(
        id,
        current.id,
        owner,
        kind,
        JSON.stringify(params),
        JSON.stringify(tasks),
        periodKey,
        tasks.length,
        stamp,
        stamp,
      );
    return (await getSeoJob(owner, current.id, id))!;
  }, `jobs:${owner}`)();
}
function parse(task: Task, result: Record<string, any>): unknown {
  switch (task.parser) {
    case "ranks":
      return parsers.parseRanks(result, task.target!, task.competitors!);
    case "overview":
      return parsers.parseOverview(result);
    case "discover":
      return parsers.parseDiscovery(result);
    case "pages":
      return parsers.parsePages(result);
    case "keywords":
      return parsers.parseRankedKeywords(result);
    case "intersection":
      return parsers.parseIntersection(result);
    case "summary":
      return parsers.parseBacklinkSummary(result);
    case "links":
      return parsers.parseBacklinks(result);
    case "domains":
      return parsers.parseReferringDomains(result);
    default:
      throw new Error("Unsupported saved search request.");
  }
}
export async function runSeoStep(
  id: string,
  send?: ProviderTransport,
): Promise<"more" | "busy" | "done"> {
  const token = randomUUID();
  const row: Row | undefined = await db
    .prepare(
      "UPDATE seo_jobs SET status='running',lease_token=?,lease_until=?,updated_at=? WHERE id=? AND status IN ('queued','running') AND (lease_until IS NULL OR lease_until<?) RETURNING *",
    )
    .get(
      token,
      Date.now() + 5 * 60000,
      new Date().toISOString(),
      id,
      Date.now(),
    );
  if (!row) {
    const r = await db
      .prepare("SELECT status FROM seo_jobs WHERE id=?")
      .get(id);
    return r && ["queued", "running"].includes(r.status) ? "busy" : "done";
  }
  const p = await ownedProject(row.owner_id, row.project_id);
  if (!p?.verified_at || !(await entitled(row.owner_id))) {
    await failSeo(
      id,
      "Verify your website and activate a subscription before running search research.",
      token,
    );
    return "done";
  }
  const tasks = JSON.parse(row.tasks) as Task[],
    parts = JSON.parse(row.parts) as SeoPart[],
    params = JSON.parse(row.params) as SeoJob["params"];
  const task = tasks[row.done];
  if (!task) {
    await failSeo(id, "This research job has no remaining request.", token);
    return "done";
  }
  // Each task has a permanent operation key. A worker may safely replay a saved
  // result after a checkpoint crash, but never an uncertain paid request.
  const key = task.keywordId
    ? `rank:${row.owner_id}:${row.project_id}:${task.keywordId}:${params.day}`
    : `seo:${row.owner_id}:${id}:${task.key}`;
  let part: SeoPart = { key: task.key, label: task.label };
  if (
    !(await db
      .prepare(
        "SELECT id FROM seo_jobs WHERE id=? AND lease_token=? AND status='running'",
      )
      .get(id, token))
  )
    return "done";
  try {
    part.data = await providerRequest(
      row.owner_id,
      key,
      task.endpoint,
      task.body,
      (result) => parse(task, result),
      send,
    );
  } catch (e) {
    part.error =
      e instanceof Error ? e.message : "This section could not be refreshed.";
  }
  parts.push(part);
  return db.transaction(async () => {
    const done = row.done + 1,
      finished = done >= row.total;
    const failures = parts.filter((p) => p.error).length;
    const status = finished
      ? failures === parts.length
        ? "failed"
        : failures
          ? "partial"
          : "complete"
      : "running";
    const changed = await db
      .prepare(
        "UPDATE seo_jobs SET parts=?,done=?,status=?,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND status='running' AND lease_token=?",
      )
      .run(
        JSON.stringify(parts),
        done,
        status,
        new Date().toISOString(),
        id,
        token,
      );
    if (!changed.changes) return "done";
    if (task.keywordId && part.data) {
      const data = part.data as RankData;
      await db
        .prepare(
          "INSERT INTO rank_observations(id,keyword_id,owner_id,day,checked_at,data) VALUES(?,?,?,?,?,?) ON CONFLICT(keyword_id,day) DO NOTHING",
        )
        .run(
          randomUUID(),
          task.keywordId,
          row.owner_id,
          params.day,
          data.checkedAt,
          JSON.stringify(data),
        );
    }
    if (finished && row.kind === "ranks")
      await db
        .prepare(
          "UPDATE schedules SET last_status=?,last_error=? WHERE project_id=? AND owner_id=? AND kind='ranks' AND last_run_at<=?",
        )
        .run(
          status,
          failures
            ? "Some keyword checks need attention. Open Rank tracking for details."
            : null,
          row.project_id,
          row.owner_id,
          row.created_at,
        );
    return finished ? "done" : "more";
  }, `jobs:${row.owner_id}`)();
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
