import robotsParser from "robots-parser";
import { load } from "cheerio";
import { randomUUID } from "node:crypto";
import { safeFetch, normalizeUrl, type ResponseData } from "./network.ts";
import { analyzePage, buildFindings, healthScore } from "./analyze.ts";
import type { Audit, PageResult } from "../src/types.ts";
export interface CrawlState {
  url: string;
  origin: string;
  queue: string[];
  seen: string[];
  pages: PageResult[];
  skipped: { url: string; reason: string }[];
  attempts: number;
  discovered: number;
  sitemapsLoaded: boolean;
}
export interface CrawlOptions {
  resume?: CrawlState;
  checkpoint?: (state: CrawlState) => void;
  signal?: AbortSignal;
  cancelled?: () => boolean;
}
export async function crawl(
  input: string,
  fetcher: typeof safeFetch = safeFetch,
  maxPages = 10000,
  options: CrawlOptions = {},
): Promise<Audit> {
  const start = normalizeUrl(input);
  const signal = options.signal ?? AbortSignal.timeout(6 * 60 * 60 * 1000);
  const policies = new Map<string, ReturnType<typeof robotsParser>>();
  const loadPolicy = async (origin: string) => {
    if (policies.has(origin)) return policies.get(origin)!;
    const r = await fetcher(`${origin}/robots.txt`, { signal });
    if (r.status >= 500 || [401, 403, 429].includes(r.status))
      throw new Error(
        "This website is not allowing our crawler right now. Try again later.",
      );
    if (r.status !== 404 && r.status !== 410 && r.status >= 300)
      throw new Error("We could not confirm this website’s crawl permissions.");
    const policy = robotsParser(
      `${origin}/robots.txt`,
      r.status < 300 ? r.body : "",
    );
    policies.set(origin, policy);
    return policy;
  };
  let state = options.resume;
  let first: ResponseData | undefined;
  if (!state) {
    let home = start;
    for (let hop = 0; hop < 5; hop++) {
      const policy = await loadPolicy(home.origin);
      if (policy.isAllowed(home.href, "ZoomiAudit") === false)
        throw new Error(
          "This website’s robots.txt asks us not to scan this page.",
        );
      first = await fetcher(home.href, {
        signal,
        followRedirects: false,
        allow: (u) => policy.isAllowed(u, "ZoomiAudit") !== false,
      });
      if (
        [301, 302, 303, 307, 308].includes(first.status) &&
        first.headers.location
      ) {
        home = normalizeUrl(new URL(first.headers.location, home).href);
        first = undefined;
        continue;
      }
      break;
    }
    if (!first) throw new Error("The website has too many redirects.");
    if (first.status >= 400)
      throw new Error(`The starting page returned an error (${first.status}).`);
    if (!first.type.includes("text/html"))
      throw new Error(
        "This address is not an HTML webpage. Enter your website’s homepage.",
      );
    state = {
      url: first.url,
      origin: new URL(first.url).origin,
      queue: [first.url],
      seen: [],
      pages: [],
      skipped: [],
      attempts: 0,
      discovered: 1,
      sitemapsLoaded: false,
    };
  }
  const policy = await loadPolicy(state.origin);
  const crawlDelay = policy.getCrawlDelay("ZoomiAudit") ?? 0.5;
  if (crawlDelay > 60)
    throw new Error(
      "This website requests more than 60 seconds between requests. Contact support to schedule a slower audit.",
    );
  const delay = Math.max(250, crawlDelay * 1000);
  const seen = new Set(state.seen);
  const queued = new Set(state.queue);
  const cap = Math.max(maxPages * 3, 100);
  const add = (candidate: string) => {
    try {
      const u = normalizeUrl(candidate);
      u.hash = "";
      if (
        u.origin === state!.origin &&
        !u.search &&
        !seen.has(u.href) &&
        !queued.has(u.href) &&
        queued.size < cap
      ) {
        state!.queue.push(u.href);
        queued.add(u.href);
        state!.discovered++;
      }
    } catch {
      /* Invalid URLs never enter the crawl queue. */
    }
  };
  if (!state.sitemapsLoaded) {
    const sitemapQueue = [
      ...policy.getSitemaps(),
      `${state.origin}/sitemap.xml`,
    ];
    const done = new Set<string>();
    while (sitemapQueue.length && done.size < 100) {
      if (options.cancelled?.()) throw new Error("Audit cancelled.");
      const url = sitemapQueue.shift()!;
      if (done.has(url)) continue;
      done.add(url);
      try {
        if (new URL(url).origin !== state.origin) continue;
        const r = await fetcher(url, {
          signal,
          allowedOrigin: state.origin,
          allow: (u) => policy.isAllowed(u, "ZoomiAudit") !== false,
        });
        if (r.status !== 200) continue;
        const $ = load(r.body, { xml: true });
        if ($("sitemapindex").length) {
          $("sitemap loc").each((_, el) => {
            if (sitemapQueue.length < 100)
              sitemapQueue.push($(el).text().trim());
          });
        } else $("url loc").each((_, el) => add($(el).text().trim()));
      } catch (error) {
        if (signal.aborted) throw error;
      }
      if (sitemapQueue.length) await new Promise((r) => setTimeout(r, delay));
    }
    state.sitemapsLoaded = true;
    options.checkpoint?.(state);
  }
  while (
    state.queue.length &&
    state.pages.length < maxPages &&
    state.attempts < cap
  ) {
    if (options.cancelled?.()) throw new Error("Audit cancelled.");
    signal.throwIfAborted();
    const url = state.queue.shift()!;
    queued.delete(url);
    if (seen.has(url)) continue;
    seen.add(url);
    state.attempts++;
    if (policy.isAllowed(url, "ZoomiAudit") === false) {
      if (state.skipped.length < 2000)
        state.skipped.push({ url, reason: "Excluded by robots.txt" });
      continue;
    }
    try {
      const response =
        first && first.url === url
          ? first
          : await fetcher(url, {
              signal,
              allowedOrigin: state.origin,
              allow: (u) => policy.isAllowed(u, "ZoomiAudit") !== false,
            });
      first = undefined;
      if (!response.type.includes("text/html")) {
        if (state.skipped.length < 2000)
          state.skipped.push({ url, reason: "Not an HTML page" });
        continue;
      }
      if (state.pages.some((p) => p.url === response.url)) continue;
      const p = analyzePage(
        response.body,
        response.url,
        response.status,
        String(response.headers["x-robots-tag"] ?? ""),
      );
      state.pages.push(p);
      if (p.status < 300) for (const link of p.links) add(link);
    } catch (error) {
      if (signal.aborted) {
        state.queue.unshift(url);
        seen.delete(url);
        state.attempts--;
        state.seen = [...seen];
        options.checkpoint?.(state);
        throw error;
      }
      if (state.skipped.length < 2000)
        state.skipped.push({
          url,
          reason:
            error instanceof Error ? error.message : "Could not load page",
        });
    }
    state.seen = [...seen];
    options.checkpoint?.(state);
    if (state.queue.length && state.pages.length < maxPages)
      await new Promise((r) => setTimeout(r, delay));
  }
  state.seen = [...seen];
  options.checkpoint?.(state);
  const findings = buildFindings(state.pages);
  return {
    id: randomUUID(),
    url: state.url,
    createdAt: new Date().toISOString(),
    score: healthScore(state.pages, findings),
    pages: state.pages,
    findings,
    skipped: state.skipped,
    completed: [],
    limit: maxPages,
    coverage: {
      discovered: state.discovered,
      remaining: state.queue.length,
      partial: state.queue.length > 0 || state.skipped.length > 0,
    },
  };
}
