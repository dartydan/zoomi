import { randomUUID } from "node:crypto";
import { db, ownedProject } from "./database";
import {
  validCountry,
  seoDomain,
  dailyUserLimit,
  researchReady,
  backlinksReady,
} from "./seo-provider";
import type {
  TrackedKeyword,
  RankObservation,
  Competitor,
  SeoCapabilities,
} from "../src/seo-types";
export const keywordLimit = 50,
  competitorLimit = 5;
export async function capabilities(owner: string): Promise<SeoCapabilities> {
  return {
    configured: researchReady(),
    backlinksConfigured: backlinksReady(),
    keywordLimit,
    competitorLimit,
    dailyRequests: dailyUserLimit(),
    requestsUsed: Number(
      (
        await db
          .prepare(
            "SELECT COUNT(*) n FROM provider_calls WHERE owner_id=? AND created_at>=?",
          )
          .get(owner, new Date().toISOString().slice(0, 10))
      ).n,
    ),
  };
}
export async function history(
  owner: string,
  project: string,
  id: string,
): Promise<RankObservation[]> {
  const row = await db
    .prepare(
      "SELECT id FROM tracked_keywords WHERE id=? AND owner_id=? AND project_id=?",
    )
    .get(id, owner, project);
  if (!row) throw new Error("Tracked keyword not found.");
  return (
    await db
      .prepare(
        "SELECT * FROM rank_observations WHERE keyword_id=? AND owner_id=? ORDER BY day DESC LIMIT 90",
      )
      .all(id, owner)
  ).map((r) => ({
    ...JSON.parse(r.data),
    id: r.id,
    keywordId: r.keyword_id,
    day: r.day,
  }));
}
export async function listKeywords(
  owner: string,
  project: string,
): Promise<TrackedKeyword[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM tracked_keywords WHERE owner_id=? AND project_id=? ORDER BY active DESC,created_at",
    )
    .all(owner, project);
  const observations = await db
    .prepare(
      `SELECT r.* FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY keyword_id ORDER BY day DESC) AS rn FROM rank_observations WHERE owner_id=?) r JOIN tracked_keywords k ON k.id=r.keyword_id WHERE k.project_id=? AND r.rn<=2 ORDER BY r.day DESC`,
    )
    .all(owner, project);
  return rows.map((r) => {
    const h = observations
      .filter((o) => o.keyword_id === r.id)
      .map((o) => ({
        ...JSON.parse(o.data),
        competitors: [],
        leadingResults: [],
        id: o.id,
        keywordId: o.keyword_id,
        day: o.day,
      }));
    return {
      id: r.id,
      keyword: r.keyword,
      country: r.country,
      device: r.device,
      active: r.active,
      createdAt: r.created_at,
      latest: h[0] ?? null,
      previous: h[1] ?? null,
    };
  });
}
export async function saveKeyword(owner: string, project: string, input: any) {
  const keyword =
    typeof input?.keyword === "string"
      ? input.keyword.normalize("NFKC").trim().replace(/\s+/g, " ")
      : "";
  if (!keyword || keyword.length > 200 || /[\u0000-\u001f\u007f]/.test(keyword))
    throw new Error("Enter a keyword between 1 and 200 characters.");
  const country = validCountry(input.country);
  const device = input.device;
  if (device !== "desktop" && device !== "mobile")
    throw new Error("Choose desktop or mobile.");
  return db.transaction(async () => {
    if (!(await ownedProject(owner, project)))
      throw new Error("Website not found.");
    const existing = await db
      .prepare(
        "SELECT * FROM tracked_keywords WHERE project_id=? AND keyword_key=? AND country=? AND device=?",
      )
      .get(project, keyword.toLowerCase(), country, device);
    if (existing?.active) return existing.id;
    await checkKeywordLimit(owner, project);
    if (existing) {
      await db
        .prepare("UPDATE tracked_keywords SET active=true WHERE id=?")
        .run(existing.id);
      return existing.id;
    }
    // Limit paused records as well, so storing preferences cannot grow without bound.
    if (
      Number(
        (
          await db
            .prepare(
              "SELECT COUNT(*) n FROM tracked_keywords WHERE project_id=?",
            )
            .get(project)
        ).n,
      ) >= 200
    )
      throw new Error(
        "This website has reached its 200 saved-keyword limit. Remove an unused keyword first.",
      );
    const id = randomUUID();
    await db
      .prepare(
        "INSERT INTO tracked_keywords(id,project_id,owner_id,keyword,keyword_key,country,device,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        project,
        owner,
        keyword,
        keyword.toLowerCase(),
        country,
        device,
        new Date().toISOString(),
      );
    return id;
  }, `jobs:${owner}`)();
}
async function checkKeywordLimit(owner: string, project: string) {
  if (
    Number(
      (
        await db
          .prepare(
            "SELECT COUNT(*) n FROM tracked_keywords WHERE project_id=? AND owner_id=? AND active=true",
          )
          .get(project, owner)
      ).n,
    ) >= keywordLimit
  )
    throw new Error(
      `Pause a keyword first. This website can track ${keywordLimit} keyword, country and device combinations.`,
    );
}
export async function setKeywordActive(
  owner: string,
  project: string,
  id: string,
  active: unknown,
) {
  if (typeof active !== "boolean")
    throw new Error("Choose whether to track this keyword.");
  await db.transaction(async () => {
    const k = await db
      .prepare(
        "SELECT * FROM tracked_keywords WHERE id=? AND owner_id=? AND project_id=?",
      )
      .get(id, owner, project);
    if (!k) throw new Error("Tracked keyword not found.");
    if (active && !k.active) await checkKeywordLimit(owner, project);
    await db
      .prepare("UPDATE tracked_keywords SET active=? WHERE id=?")
      .run(active, id);
  }, `jobs:${owner}`)();
}
export async function removeKeyword(
  owner: string,
  project: string,
  id: string,
) {
  await db.transaction(async () => {
    // Prevent a mid-run deletion from breaking a history checkpoint.
    if (
      await db
        .prepare(
          "SELECT id FROM seo_jobs WHERE project_id=? AND kind='ranks' AND status IN ('queued','running')",
        )
        .get(project)
    )
      throw new Error(
        "Wait for this website’s rank check to finish before removing a keyword.",
      );
    await db
      .prepare(
        "DELETE FROM tracked_keywords WHERE id=? AND owner_id=? AND project_id=?",
      )
      .run(id, owner, project);
  }, `jobs:${owner}`)();
}
export async function listCompetitors(
  owner: string,
  project: string,
): Promise<Competitor[]> {
  return (
    await db
      .prepare(
        "SELECT * FROM competitors WHERE owner_id=? AND project_id=? ORDER BY created_at",
      )
      .all(owner, project)
  ).map((r) => ({ id: r.id, domain: r.domain, createdAt: r.created_at }));
}
export async function addCompetitor(
  owner: string,
  project: string,
  value: unknown,
) {
  const domain = seoDomain(value);
  return db.transaction(async () => {
    const p = await ownedProject(owner, project);
    if (!p) throw new Error("Website not found.");
    if (domain === seoDomain(p.url))
      throw new Error("Choose a different website to compare.");
    const rows = await listCompetitors(owner, project);
    if (rows.some((r) => r.domain === domain)) return;
    if (rows.length >= competitorLimit)
      throw new Error(
        "Remove a competitor first. You can save five per website.",
      );
    await db
      .prepare(
        "INSERT INTO competitors(id,project_id,owner_id,domain,created_at) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), project, owner, domain, new Date().toISOString());
  }, `jobs:${owner}`)();
}
export async function removeCompetitor(
  owner: string,
  project: string,
  id: string,
) {
  await db
    .prepare(
      "DELETE FROM competitors WHERE id=? AND owner_id=? AND project_id=?",
    )
    .run(id, owner, project);
}
