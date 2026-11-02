import dns from "node:dns/promises";
import { load } from "cheerio";
import type { ProjectRow } from "./database.ts";
import { safeFetch } from "./network.ts";
export async function verifySite(p: ProjectRow) {
  const host = new URL(p.url).hostname;
  const expected = `zoomi-audit=${p.verification_token}`;
  try {
    const records = await dns.resolveTxt(`_zoomi-audit.${host}`);
    if (records.some((r) => r.join("") === expected)) return "dns";
  } catch {
    /* The customer can also verify with a tag. */
  }
  const page = await safeFetch(p.url, {
    allowedOrigin: new URL(p.url).origin,
    signal: AbortSignal.timeout(20000),
  });
  if (page.status === 200) {
    const $ = load(page.body);
    if (
      $('meta[name="zoomi-audit-verification"]').attr("content") ===
      p.verification_token
    )
      return "meta";
  }
  throw new Error(
    "Verification is not visible yet. Add the tag or DNS record, publish the change, then try again. You can also verify through Search Console.",
  );
}
