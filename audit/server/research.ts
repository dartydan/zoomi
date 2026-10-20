import { randomUUID } from "node:crypto";
import { db, type ProjectRow } from "./database.ts";
import { normalizeUrl } from "./network.ts";
export const researchReady = () =>
  !!(
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD &&
    Number(process.env.DATAFORSEO_DAILY_REQUEST_LIMIT) > 0
  );

export const locations: Record<string, number> = {
  "United States": 2840,
  "United Kingdom": 2826,
  Canada: 2124,
  Australia: 2036,
};
interface Item {
  keyword_data?: {
    keyword?: string;
    keyword_info?: { search_volume?: number; last_updated_time?: string };
    keyword_properties?: { keyword_difficulty?: number };
  };
  first_domain_serp_element?: { rank_group?: number; url?: string };
}
export function parseGap(data: {
  status_code?: number;
  tasks?: {
    status_code?: number;
    result?: { items?: Item[]; total_count?: number }[];
  }[];
}) {
  const task = data.tasks?.[0];
  if (data.status_code !== 20000 || task?.status_code !== 20000)
    throw new Error(
      "The search data provider could not complete this request.",
    );
  const result = task.result?.[0];
  return {
    total: result?.total_count ?? 0,
    items: (result?.items ?? [])
      .filter((i) => i.keyword_data?.keyword)
      .map((i) => ({
        keyword: i.keyword_data!.keyword!,
        volume: i.keyword_data?.keyword_info?.search_volume ?? null,
        difficulty:
          i.keyword_data?.keyword_properties?.keyword_difficulty ?? null,
        updatedAt: i.keyword_data?.keyword_info?.last_updated_time ?? null,
        competitorPosition: i.first_domain_serp_element?.rank_group ?? null,
      })),
  };
}
export async function keywordGap(
  owner: string,
  project: ProjectRow,
  competitor: string,
  country: string,
) {
  if (!researchReady())
    throw new Error("Zoomi’s search-data connection is awaiting activation.");
  const target = normalizeUrl(competitor).hostname.replace(/^www\./, "");
  const own = new URL(project.url).hostname.replace(/^www\./, "");
  if (target === own) throw new Error("Choose a different website to compare.");
  if (!locations[country]) throw new Error("Choose a supported search region.");
  const cache = (await db
    .prepare(
      "SELECT data FROM research WHERE owner_id=? AND project_id=? AND type='keyword-gap' AND created_at>? ORDER BY created_at DESC",
    )
    .all(owner, project.id, new Date(Date.now() - 86400000).toISOString())) as {
    data: string;
  }[];
  const cached = cache
    .map((r) => JSON.parse(r.data))
    .find((r) => r.competitor === target && r.country === country);
  if (cached) return cached;
  const id = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async () => {
    const total = (
      (await db
        .prepare("SELECT COUNT(*) n FROM provider_calls WHERE created_at>=?")
        .get(today)) as { n: number }
    ).n;
    const user = (
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM provider_calls WHERE owner_id=? AND created_at>=?",
        )
        .get(owner, today)) as { n: number }
    ).n;
    if (
      total >= Number(process.env.DATAFORSEO_DAILY_REQUEST_LIMIT) ||
      user >= 10
    )
      throw new Error(
        "The daily research allowance has been reached. Try again tomorrow.",
      );
    await db
      .prepare("INSERT INTO provider_calls VALUES(?,?,?,?)")
      .run(id, owner, new Date().toISOString(), "pending");
  })();
  try {
    const response = await fetch(
      "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            target1: target,
            target2: own,
            location_code: locations[country],
            language_code: "en",
            intersections: false,
            item_types: ["organic"],
            limit: 100,
          },
        ]),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new Error("The search data provider is unavailable.");
    const parsed = parseGap(await response.json());
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
      .prepare("INSERT INTO research VALUES(?,?,?,?,?,?)")
      .run(
        id,
        owner,
        project.id,
        "keyword-gap",
        JSON.stringify(result),
        new Date().toISOString(),
      );
    await db
      .prepare("UPDATE provider_calls SET status='complete' WHERE id=?")
      .run(id);
    return result;
  } catch (error) {
    await db
      .prepare("UPDATE provider_calls SET status='failed' WHERE id=?")
      .run(id);
    throw error;
  }
}
