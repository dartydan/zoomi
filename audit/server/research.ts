import { randomUUID } from "node:crypto";
import { db, type ProjectRow } from "./database";
import {
  researchReady,
  locations,
  seoDomain,
  validCountry,
  fingerprint,
  providerRequest,
  providerResult,
} from "./seo-provider";
import { parseIntersection } from "./seo-parsers";
export { researchReady, locations };
// Retained for existing saved keyword-gap reports and clients.
export function parseGap(data: unknown) {
  const parsed = parseIntersection(providerResult(data));
  return {
    total: parsed.total,
    items: parsed.items.map(({ ownPosition, url, ...item }) => item),
  };
}
export async function keywordGap(
  owner: string,
  project: ProjectRow,
  competitor: string,
  country: string,
) {
  if (!project.verified_at)
    throw new Error("Verify your website before starting research.");
  const target = seoDomain(competitor),
    own = seoDomain(project.url);
  validCountry(country);
  if (target === own) throw new Error("Choose a different website to compare.");
  const body = {
    target1: target,
    target2: own,
    location_code: locations[country],
    language_code: "en",
    intersections: false,
    item_types: ["organic"],
    limit: 100,
  };
  const day = new Date().toISOString().slice(0, 10);
  const parsed = await providerRequest(
    owner,
    `gap:${owner}:${project.id}:${day}:${fingerprint(body)}`,
    "dataforseo_labs/google/domain_intersection/live",
    body,
    parseIntersection,
  );
  const result = {
    ...parsed,
    competitor: target,
    website: own,
    country,
    language: "English",
    source: "DataForSEO",
    retrievedAt: new Date().toISOString(),
  };
  await db
    .prepare(
      "INSERT INTO research(id,owner_id,project_id,type,data,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      owner,
      project.id,
      "keyword-gap",
      JSON.stringify(result),
      result.retrievedAt,
    );
  return result;
}
