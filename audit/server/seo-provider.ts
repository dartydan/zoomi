import { createHash } from "node:crypto";
import { normalizeUrl } from "./network";
export const locations: Record<string, number> = {
  "United States": 2840,
  "United Kingdom": 2826,
  Canada: 2124,
  Australia: 2036,
};
// Licensed aggregation was retired. Environment keys cannot re-enable it.
export const dailyUserLimit = () => 0;
export const researchReady = () => false;
export const backlinksReady = () => false;
export const collectionPending =
  "Audit collects its own data. Direct search-result collection is not active yet. Use Backlinks and Competitors to collect website evidence.";
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
// Compatibility entry point for older clients. No network transport remains.
export async function providerRequest<T>(
  _owner: string,
  _key: string,
  _endpoint: string,
  _body: Record<string, unknown>,
  _parse: (result: Record<string, any>) => T,
  _send?: ProviderTransport,
): Promise<T> {
  throw new Error(collectionPending);
}
