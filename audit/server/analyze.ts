import { load } from "cheerio";
import type { Category, Finding, PageResult, Severity } from "../src/types.ts";

export function analyzePage(
  html: string,
  url: string,
  status = 200,
  xRobots = "",
): PageResult {
  const $ = load(html);
  const meta = (name: string) =>
    $("meta")
      .filter((_, el) => $(el).attr("name")?.toLowerCase() === name)
      .first()
      .attr("content")
      ?.trim() ?? "";
  const h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const images = $("img");
  let invalidSchema = false;
  const schema = $('script[type="application/ld+json"]');
  schema.each((_, el) => {
    try {
      JSON.parse($(el).text());
    } catch {
      invalidSchema = true;
    }
  });
  const links = new Set<string>();
  const outgoing = new Map<
    string,
    { url: string; anchor: string; rel: string[] }
  >();
  let outgoingLinksTruncated = false;
  let base = url;
  try {
    base = new URL($("base[href]").first().attr("href") ?? url, url).href;
  } catch {
    /* Use the response URL. */
  }
  $("a[href]").each((_, el) => {
    try {
      const href = new URL($(el).attr("href")!, base);
      // Cloudflare's encoded email links are decoded by the browser, not pages.
      if (href.pathname === "/cdn-cgi/l/email-protection" && href.hash) return;
      href.hash = "";
      if (
        ["http:", "https:"].includes(href.protocol) &&
        !href.username &&
        !href.password &&
        href.href.length <= 2048
      ) {
        const rel = ($(el).attr("rel") ?? "")
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 20);
        const existing = outgoing.get(href.href);
        if (existing)
          existing.rel = [...new Set([...existing.rel, ...rel])].slice(0, 20);
        else if (outgoing.size < 500)
          outgoing.set(href.href, {
            url: href.href,
            anchor: $(el).text().replace(/\s+/g, " ").trim().slice(0, 500),
            rel,
          });
        else outgoingLinksTruncated = true;
      }
      if (
        href.origin === new URL(url).origin &&
        ["http:", "https:"].includes(href.protocol) &&
        !/\.(pdf|png|jpg|jpeg|gif|svg|zip|mp4|webp|xml|css|js)$/i.test(
          href.pathname,
        ) &&
        !href.search
      )
        links.add(href.href);
    } catch {
      /* Invalid links are not queued. */
    }
  });
  $("script,style,nav,footer,header,noscript").remove();
  $("h1,h2,h3,h4,h5,h6,p,div,li,section,article,td,br").append(" ");
  return {
    url,
    status,
    title: $("title").first().text().trim(),
    description: meta("description"),
    h1,
    wordCount: $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length,
    images: images.length,
    missingAlt: images.filter(
      (_, el) =>
        $(el).attr("alt") === undefined &&
        $(el).attr("role") !== "presentation" &&
        $(el).attr("aria-hidden") !== "true",
    ).length,
    canonical: $('link[rel="canonical"]').attr("href") ?? "",
    noindex: /(?:^|[\s,;])(?:noindex|none)(?:$|[\s,;])/i.test(
      `${meta("robots")} ${meta("googlebot")} ${xRobots}`,
    ),
    viewport: /width\s*=\s*device-width/i.test(meta("viewport")),
    schema: schema.length > 0,
    invalidSchema,
    links: [...links].slice(0, 1000),
    observedAt: new Date().toISOString(),
    outgoingLinks: [...outgoing.values()],
    outgoingLinksTruncated,
  };
}
const issue = (
  id: string,
  title: string,
  category: Category,
  severity: Severity,
  weight: number,
  effort: string,
  why: string,
  steps: string[],
  pages: PageResult[],
): Finding => ({
  id,
  title,
  category,
  severity,
  weight,
  effort,
  why,
  steps,
  urls: pages.map((p) => p.url),
});
export function buildFindings(pages: PageResult[]): Finding[] {
  const ok = pages.filter((p) => p.status >= 200 && p.status < 300);
  const titleCounts = new Map<string, number>();
  for (const p of ok)
    if (p.title)
      titleCounts.set(
        p.title.toLowerCase(),
        (titleCounts.get(p.title.toLowerCase()) ?? 0) + 1,
      );
  const checks: Finding[] = [
    issue(
      "broken-pages",
      "Repair pages that don’t open",
      "Technical",
      "high",
      30,
      "May need help",
      "Visitors and search engines hit a dead end when a page returns an error.",
      [
        "Open the affected address and check that it should exist.",
        "Restore the page, or redirect the old address to its closest relevant replacement.",
        "Update links that still point to the old address, then run another audit.",
      ],
      pages.filter((p) => p.status >= 400),
    ),
    issue(
      "noindex",
      "Review pages hidden from search",
      "Technical",
      "high",
      20,
      "10–20 min",
      "These pages ask search engines not to include them in results. That may be intentional for private or thank-you pages.",
      [
        "Decide whether each affected page should appear in search.",
        "For public pages, turn off “Hide from search engines” in your website’s SEO settings.",
        "Keep intentionally private pages hidden. Re-run the audit after changes.",
      ],
      ok.filter((p) => p.noindex),
    ),
    issue(
      "missing-title",
      "Give every page a search title",
      "Search basics",
      "high",
      15,
      "5–10 min / page",
      "A descriptive title helps people and search engines understand what a page offers.",
      [
        "Open the page’s SEO settings in your website editor.",
        "Write a unique title that describes the page, with your main service or product near the beginning.",
        "Save, publish, and run another audit to check the change.",
      ],
      ok.filter((p) => !p.title),
    ),
    issue(
      "missing-description",
      "Write your search descriptions",
      "Search basics",
      "medium",
      8,
      "5–10 min / page",
      "A useful description can help someone choose your result. Search engines may use a different excerpt.",
      [
        "Open the affected page’s SEO description field.",
        "Describe what makes this page useful in one or two clear sentences.",
        "Include a natural next step. Keep descriptions specific to each page.",
      ],
      ok.filter((p) => !p.description),
    ),
    issue(
      "missing-h1",
      "Add a clear page headline",
      "Content",
      "medium",
      10,
      "5–10 min / page",
      "A clear main heading helps visitors understand where they are and makes the page easier to navigate.",
      [
        "Open the page in your website editor.",
        "Give it a descriptive main heading and set the heading level to H1.",
        "Make the headline match what the page actually helps the visitor do.",
      ],
      ok.filter((p) => p.h1.length === 0),
    ),
    issue(
      "missing-alt",
      "Describe images that carry meaning",
      "Accessibility",
      "medium",
      5,
      "2–5 min / image",
      "Image descriptions help people using screen readers understand meaningful images. Decorative images can have an empty description.",
      [
        "Open each affected page and inspect its images.",
        "Add a short description to informative images in the alt text field.",
        "For purely decorative images, use an empty alt text value. Avoid repeating keywords.",
      ],
      ok.filter((p) => p.missingAlt > 0),
    ),
    issue(
      "viewport",
      "Check your mobile page settings",
      "Technical",
      "high",
      12,
      "May need help",
      "These pages are missing the standard instruction that helps layouts fit mobile screens. This check does not measure the full mobile experience.",
      [
        "Preview the page on a phone.",
        "Ask your site builder or developer to add a viewport meta tag with width=device-width.",
        "Check the layout again on mobile after publishing.",
      ],
      ok.filter((p) => !p.viewport),
    ),
    issue(
      "http",
      "Use a secure website address",
      "Technical",
      "high",
      20,
      "May need help",
      "HTTPS protects the connection between your website and visitors.",
      [
        "Enable the SSL or HTTPS setting with your website host.",
        "Make sure HTTP addresses redirect to HTTPS.",
        "Update internal links to use the secure address.",
      ],
      ok.filter((p) => new URL(p.url).protocol === "http:"),
    ),
    issue(
      "invalid-schema",
      "Repair unreadable structured data",
      "Technical",
      "medium",
      5,
      "May need help",
      "Some structured data is not valid JSON, so automated systems may be unable to read it. This is a syntax check, not full schema validation.",
      [
        "Review the structured data added by your website or SEO plugin.",
        "Use Google’s Rich Results Test to locate the invalid markup.",
        "Correct the syntax and validate it before publishing.",
      ],
      ok.filter((p) => p.invalidSchema),
    ),
    issue(
      "duplicate-title",
      "Make similar search titles distinct",
      "Search basics",
      "medium",
      8,
      "5–10 min / page",
      "Pages with identical titles are harder to distinguish in search results.",
      [
        "Review pages sharing the same title.",
        "Write a title that describes the specific service, product, or topic of each page.",
        "If the pages really duplicate one another, ask your website provider about consolidating them.",
      ],
      ok.filter(
        (p) => p.title && (titleCounts.get(p.title.toLowerCase()) ?? 0) > 1,
      ),
    ),
  ];
  return checks
    .filter((c) => c.urls.length)
    .sort((a, b) => b.weight * b.urls.length - a.weight * a.urls.length);
}
export function healthScore(pages: PageResult[], findings: Finding[]): number {
  if (!pages.length) throw new Error("No pages could be checked.");
  const penalty =
    findings.reduce((sum, f) => sum + f.weight * f.urls.length, 0) /
    pages.length;
  return Math.max(0, Math.round(100 - penalty));
}
