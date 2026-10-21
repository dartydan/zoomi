import { createHash, randomUUID } from "node:crypto";
import { db } from "./database";
import { normalizeUrl } from "./network";
export const locations: Record<string, number> = {
  "United States": 2840,
  "United Kingdom": 2826,
  Canada: 2124,
  Australia: 2036,
};
export const dailyUserLimit = () => {
  const value = Number(process.env.DATAFORSEO_USER_DAILY_REQUEST_LIMIT ?? 100);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
};
const platformLimit = () => {
  const value = Number(process.env.DATAFORSEO_DAILY_REQUEST_LIMIT);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
};
export const researchReady = () =>
  !!(
    process.env.DATAFORSEO_LOGIN &&
    process.env.DATAFORSEO_PASSWORD &&
    platformLimit() &&
    dailyUserLimit()
  );
export const backlinksReady = () =>
  researchReady() && process.env.DATAFORSEO_BACKLINKS_ENABLED === "true";
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function seoDomain(value: unknown) {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Enter a valid website address.");
  return normalizeUrl(value)
    .hostname.toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}
export function validCountry(value: unknown): string {
  if (typeof value !== "string" || !Object.hasOwn(locations, value))
    throw new Error("Choose a supported search region.");
  return value;
}
export function safeProviderUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
export function textOrNull(value: unknown, max = 500): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}
export const boolOrNull = (value: unknown) =>
  typeof value === "boolean" ? value : null;
export type ProviderTransport = (
  endpoint: string,
  body: Record<string, unknown>,
) => Promise<unknown>;
const allowedEndpoints = new Set([
  "serp/google/organic/live/advanced",
  "backlinks/summary/live",
  "backlinks/backlinks/live",
  "backlinks/referring_domains/live",
  "dataforseo_labs/google/domain_intersection/live",
  "dataforseo_labs/google/competitors_domain/live",
  "dataforseo_labs/google/domain_rank_overview/live",
  "dataforseo_labs/google/relevant_pages/live",
  "dataforseo_labs/google/ranked_keywords/live",
]);
async function transport(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([body]),
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("The search-data service is unavailable.");
  // Bound provider output before JSON parsing. Do not retain their raw SERP pages.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The search-data service returned no response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      bytes += r.value.byteLength;
      if (bytes > 8_000_000)
        throw new Error("The search-data response was too large.");
      chunks.push(r.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function providerResult(value: unknown): Record<string, any> {
  const data = value as any;
  const task = data?.tasks?.[0];
  if (data?.status_code !== 20000 || task?.status_code !== 20000)
    throw new Error(
      "The search-data service could not complete this request. Check its access and account balance.",
    );
  const result = task.result?.[0];
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error(
      "No usable dataset was returned. This does not mean the website has no rankings or links.",
    );
  return result;
}
export async function providerRequest<T>(
  owner: string,
  key: string,
  endpoint: string,
  body: Record<string, unknown>,
  parse: (result: Record<string, any>) => T,
  send: ProviderTransport = transport,
): Promise<T> {
  if (!allowedEndpoints.has(endpoint))
    throw new Error("Unsupported search-data request.");
  if (
    !researchReady() ||
    (endpoint.startsWith("backlinks/") && !backlinksReady())
  )
    throw new Error(
      "Zoomi’s licensed search-data connection is awaiting activation.",
    );
  const requestHash = fingerprint([endpoint, body]);
  const admission = await db.transaction(async () => {
    const existing = await db
      .prepare(
        "SELECT * FROM provider_calls WHERE request_key=? AND owner_id=?",
      )
      .get(key, owner);
    if (existing) {
      if (existing.request_hash !== requestHash)
        throw new Error(
          "This saved request has different settings. Start a fresh check tomorrow.",
        );
      if (existing.status === "complete" && existing.response)
        return { cached: JSON.parse(existing.response) as T };
      throw new Error(
        "This request was already attempted. Its result is unavailable, so it will not be charged again automatically. Check again tomorrow.",
      );
    }
    const day = new Date().toISOString().slice(0, 10);
    const total = Number(
      (
        await db
          .prepare("SELECT COUNT(*) n FROM provider_calls WHERE created_at>=?")
          .get(day)
      ).n,
    );
    const user = Number(
      (
        await db
          .prepare(
            "SELECT COUNT(*) n FROM provider_calls WHERE created_at>=? AND owner_id=?",
          )
          .get(day, owner)
      ).n,
    );
    if (total >= platformLimit() || user >= dailyUserLimit())
      throw new Error(
        "The daily search-data allowance has been reached. Try again tomorrow.",
      );
    const id = randomUUID();
    await db
      .prepare(
        "INSERT INTO provider_calls(id,owner_id,created_at,status,request_key,request_hash,endpoint) VALUES(?,?,?,'pending',?,?,?)",
      )
      .run(id, owner, new Date().toISOString(), key, requestHash, endpoint);
    return { id };
  }, "provider:budget")();
  if ("cached" in admission) return admission.cached!;
  try {
    const parsed = parse(providerResult(await send(endpoint, body)));
    const encoded = JSON.stringify(parsed);
    if (encoded.length > 2_000_000)
      throw new Error("The normalized search report is too large.");
    await db
      .prepare(
        "UPDATE provider_calls SET status='complete',response=? WHERE id=? AND status='pending'",
      )
      .run(encoded, admission.id);
    return parsed;
  } catch {
    // The provider might have billed a timed-out request. Never replay a paid
    // operation automatically; successful cached parts can still be resumed.
    await db
      .prepare(
        "UPDATE provider_calls SET status='uncertain' WHERE id=? AND status='pending'",
      )
      .run(admission.id);
    throw new Error(
      "This search-data request could not be confirmed. It has not been repeated automatically. Check provider access or try a fresh check tomorrow.",
    );
  }
}
