export type Severity = "high" | "medium" | "low";
export type Category =
  | "Search basics"
  | "Content"
  | "Accessibility"
  | "Technical";
export interface Finding {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  why: string;
  steps: string[];
  urls: string[];
  effort: string;
  weight: number;
}
export interface PageResult {
  url: string;
  status: number;
  title: string;
  description: string;
  h1: string[];
  wordCount: number;
  images: number;
  missingAlt: number;
  canonical: string;
  noindex: boolean;
  viewport: boolean;
  schema: boolean;
  invalidSchema: boolean;
  links: string[];
}
export interface Audit {
  id: string;
  url: string;
  createdAt: string;
  score: number;
  pages: PageResult[];
  findings: Finding[];
  skipped: { url: string; reason: string }[];
  completed: string[];
  limit: number;
  coverage?: { discovered: number; remaining: number; partial: boolean };
}
export type Section =
  | "Overview"
  | "Action plan"
  | "Website audit"
  | "Content studio"
  | "Competitors"
  | "Progress"
  | "Connections";

export interface AuditSummary
  extends Pick<Audit, "id" | "url" | "createdAt" | "score"> {
  pageCount: number;
  findingCount: number;
}
