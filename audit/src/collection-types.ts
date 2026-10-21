import type { Job } from "./api";
export interface CollectionSource {
  domain: string;
  url: string;
  kind: "website" | "competitor" | "source";
  pages: number;
  lastSeen: string | null;
}
export interface CollectedLink {
  sourceUrl: string;
  targetUrl: string;
  sourceDomain: string;
  anchor: string;
  rel: string[];
  firstSeen: string;
  lastSeen: string;
  lastChecked: string;
  present: boolean;
}
export interface CollectedPage {
  url: string;
  domain: string;
  title: string;
  description: string;
  headings: string[];
  wordCount: number;
  status: number;
  noindex: boolean;
  lastSeen: string;
}
export interface CollectionState {
  sources: CollectionSource[];
  jobs: (Job & { targetUrl: string | null; purpose: string })[];
  pages: number;
  links: number;
  lastSeen: string | null;
  pageLimit: number;
  monthlyCrawls: number;
}
export interface CollectionPage<T> {
  items: T[];
  total: number;
  offset: number;
  next: number | null;
}
