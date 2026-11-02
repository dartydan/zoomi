import {
  numberOrNull as n,
  textOrNull as t,
  boolOrNull as b,
  safeProviderUrl as url,
  seoDomain,
} from "./seo-provider";
import type {
  RankData,
  OrganicMetrics,
  DomainOverview,
  Discovery,
  RankedKeywords,
  KeywordIntersection,
  CompetitorPages,
  BacklinkSummary,
  Backlinks,
  ReferringDomains,
} from "../src/seo-types";
type Data = Record<string, any>;
const items = (r: Data, limit = 100): Data[] =>
  Array.isArray(r.items)
    ? r.items.filter((i: unknown) => i && typeof i === "object").slice(0, limit)
    : [];
const position = (v: unknown) => {
  const x = n(v);
  return x !== null && Number.isInteger(x) && x > 0 ? x : null;
};
const sum = (...values: unknown[]) =>
  values.every((v) => n(v) !== null)
    ? (values as number[]).reduce((a, c) => a + c, 0)
    : null;
function domain(value: unknown) {
  try {
    return seoDomain(value);
  } catch {
    return null;
  }
}
export function organic(m: Data | undefined): OrganicMetrics {
  return {
    keywords: n(m?.count),
    estimatedVisits: n(m?.etv),
    top3: sum(m?.pos_1, m?.pos_2_3),
    top10: sum(m?.pos_1, m?.pos_2_3, m?.pos_4_10),
  };
}
export function parseRanks(
  r: Data,
  target: string,
  competitors: string[],
  checkedAt = new Date().toISOString(),
): RankData {
  // Ads, featured snippets, and other SERP features are not organic positions.
  const organicRows = items(r, 1000)
    .filter((i) => i.type === "organic")
    .flatMap((i) => {
      const u = url(i.url),
        p = position(i.rank_group);
      return u && p ? [{ position: p, url: u, title: t(i.title) ?? "" }] : [];
    });
  const match = (host: string) =>
    organicRows
      .filter((i) => {
        const h = new URL(i.url).hostname
          .toLowerCase()
          .replace(/^www\./, "")
          .replace(/\.$/, "");
        return h === host || h.endsWith(`.${host}`);
      })
      .sort((a, c) => a.position - c.position)[0];
  const found = match(target);
  return {
    position: found?.position ?? null,
    url: found?.url ?? null,
    organicResults: organicRows.length,
    deepestPosition: Math.max(0, ...organicRows.map((i) => i.position)),
    requestedDepth: 100,
    checkedAt,
    competitors: competitors.map((d) => {
      const row = match(d);
      return {
        domain: d,
        position: row?.position ?? null,
        url: row?.url ?? null,
      };
    }),
    leadingResults: organicRows
      .sort((a, c) => a.position - c.position)
      .slice(0, 10),
  };
}
export function parseOverview(r: Data): DomainOverview {
  const row = items(r, 1)[0];
  return {
    domain: domain(row?.target ?? r.target) ?? "",
    ...organic(row?.metrics?.organic),
  };
}
export function parseDiscovery(r: Data): Discovery {
  return {
    total: n(r.total_count),
    items: items(r, 20).flatMap((i) => {
      const d = domain(i.domain);
      return d
        ? [
            {
              domain: d,
              sharedKeywords: n(i.intersections),
              averagePosition: n(i.avg_position),
              ...organic(i.full_domain_metrics?.organic),
            },
          ]
        : [];
    }),
  };
}
export function parseRankedKeywords(r: Data): RankedKeywords {
  return {
    total: n(r.total_count),
    items: items(r).flatMap((i) => {
      const k = t(i.keyword_data?.keyword, 200);
      const s = i.ranked_serp_element?.serp_item;
      if (!k || s?.type !== "organic") return [];
      return [
        {
          keyword: k,
          volume: n(i.keyword_data?.keyword_info?.search_volume),
          difficulty: n(i.keyword_data?.keyword_properties?.keyword_difficulty),
          updatedAt: t(i.keyword_data?.keyword_info?.last_updated_time),
          position: position(s?.rank_group),
          url: url(s?.url),
        },
      ];
    }),
  };
}
export function parseIntersection(r: Data): KeywordIntersection {
  return {
    total: n(r.total_count),
    items: items(r).flatMap((i) => {
      const k = t(i.keyword_data?.keyword, 200);
      return k
        ? [
            {
              keyword: k,
              volume: n(i.keyword_data?.keyword_info?.search_volume),
              difficulty: n(
                i.keyword_data?.keyword_properties?.keyword_difficulty,
              ),
              updatedAt: t(i.keyword_data?.keyword_info?.last_updated_time),
              competitorPosition: position(
                i.first_domain_serp_element?.rank_group,
              ),
              ownPosition: position(i.second_domain_serp_element?.rank_group),
              url: url(i.first_domain_serp_element?.url),
            },
          ]
        : [];
    }),
  };
}
export function parsePages(r: Data): CompetitorPages {
  return {
    total: n(r.total_count),
    items: items(r, 50).flatMap((i) => {
      const u = url(i.page_address);
      return u ? [{ url: u, ...organic(i.metrics?.organic) }] : [];
    }),
  };
}
export function parseBacklinkSummary(r: Data): BacklinkSummary {
  return {
    backlinks: n(r.backlinks),
    referringDomains: n(r.referring_domains),
    referringMainDomains: n(r.referring_main_domains),
    brokenBacklinks: n(r.broken_backlinks),
    brokenPages: n(r.broken_pages),
    rank: n(r.rank),
  };
}
export function parseBacklinks(r: Data): Backlinks {
  return {
    total: n(r.total_count),
    items: items(r).flatMap((i) => {
      const from = url(i.url_from);
      return from
        ? [
            {
              from,
              to: url(i.url_to),
              domain: domain(i.domain_from),
              anchor: t(i.anchor),
              dofollow: b(i.dofollow),
              lost: b(i.is_lost),
              broken: b(i.is_broken),
              firstSeen: t(i.first_seen),
              lastSeen: t(i.last_seen),
              rank: n(i.rank),
            },
          ]
        : [];
    }),
  };
}
export function parseReferringDomains(r: Data): ReferringDomains {
  return {
    total: n(r.total_count),
    items: items(r).flatMap((i) => {
      const d = domain(i.domain);
      return d
        ? [
            {
              domain: d,
              backlinks: n(i.backlinks),
              rank: n(i.rank),
              firstSeen: t(i.first_seen),
              lost: b(i.is_lost),
            },
          ]
        : [];
    }),
  };
}
