export const searchCountries = [
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
] as const;
export type SeoKind = "ranks" | "backlinks" | "discover" | "competitor";
export type Device = "desktop" | "mobile";
export interface TrackedKeyword {
  id: string;
  keyword: string;
  country: string;
  device: Device;
  active: boolean;
  createdAt: string;
  latest: RankObservation | null;
  previous: RankObservation | null;
  positions: SearchPosition[];
}
export interface SearchPosition {
  day: string;
  position: number | null;
  clicks: number | null;
  impressions: number | null;
  checkedAt: string;
}
export interface RankData {
  position: number | null;
  url: string | null;
  organicResults: number;
  deepestPosition: number;
  requestedDepth: number;
  checkedAt: string;
  competitors: {
    domain: string;
    position: number | null;
    url: string | null;
  }[];
  leadingResults: { position: number; url: string; title: string }[];
}
export interface RankObservation extends RankData {
  id: string;
  keywordId: string;
  day: string;
}
export interface Competitor {
  id: string;
  domain: string;
  createdAt: string;
}
export interface OrganicMetrics {
  keywords: number | null;
  estimatedVisits: number | null;
  top3: number | null;
  top10: number | null;
}
export interface DomainOverview extends OrganicMetrics {
  domain: string;
}
export interface Discovery {
  total: number | null;
  items: (OrganicMetrics & {
    domain: string;
    sharedKeywords: number | null;
    averagePosition: number | null;
  })[];
}
export interface RankedKeywords {
  total: number | null;
  items: {
    keyword: string;
    volume: number | null;
    difficulty: number | null;
    position: number | null;
    url: string | null;
    updatedAt: string | null;
  }[];
}
export interface KeywordIntersection {
  total: number | null;
  items: {
    keyword: string;
    volume: number | null;
    difficulty: number | null;
    competitorPosition: number | null;
    ownPosition: number | null;
    url: string | null;
    updatedAt: string | null;
  }[];
}
export interface CompetitorPages {
  total: number | null;
  items: (OrganicMetrics & { url: string })[];
}
export interface BacklinkSummary {
  backlinks: number | null;
  referringDomains: number | null;
  referringMainDomains: number | null;
  brokenBacklinks: number | null;
  brokenPages: number | null;
  rank: number | null;
}
export interface Backlink {
  from: string;
  to: string | null;
  domain: string | null;
  anchor: string | null;
  dofollow: boolean | null;
  lost: boolean | null;
  broken: boolean | null;
  firstSeen: string | null;
  lastSeen: string | null;
  rank: number | null;
}
export interface Backlinks {
  total: number | null;
  items: Backlink[];
}
export interface ReferringDomains {
  total: number | null;
  items: {
    domain: string;
    backlinks: number | null;
    rank: number | null;
    firstSeen: string | null;
    lost: boolean | null;
  }[];
}
export interface SeoPart {
  key: string;
  label: string;
  data?: unknown;
  error?: string;
}
export interface SeoJob {
  id: string;
  kind: SeoKind;
  status:
    | "queued"
    | "running"
    | "complete"
    | "partial"
    | "failed"
    | "cancelled";
  params: {
    country?: string;
    competitor?: string;
    day: string;
    source?: string;
  };
  total: number;
  done: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  parts?: SeoPart[];
}
export interface SeoCapabilities {
  configured: boolean;
  backlinksConfigured: boolean;
  keywordLimit: number;
  competitorLimit: number;
  dailyRequests: number;
  requestsUsed: number;
}
