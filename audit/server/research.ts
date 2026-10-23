import { type ProjectRow } from "./database";
import { researchReady, locations, providerResult } from "./seo-provider";
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
  _owner: string,
  _project: ProjectRow,
  _competitor: string,
  _country: string,
) {
  throw new Error(
    "Audit now collects website evidence directly. Open Competitors to collect and compare public pages. Search-position gaps are not available yet.",
  );
}
