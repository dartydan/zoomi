import type { Audit, Severity } from "../src/types";
export type ChangeStatus = "resolved" | "new" | "persisting" | "unverified";
export interface AuditChange {
  findingId: string;
  title: string;
  severity: Severity;
  url: string;
  status: ChangeStatus;
  newlyDiscovered: boolean;
}
export interface AuditComparison {
  previousId: string;
  currentId: string;
  previousDate: string;
  currentDate: string;
  compatible: boolean;
  coverage: {
    previousPages: number;
    currentPages: number;
    sharedPages: number;
    addedPages: number;
    uncheckedPages: number;
  };
  counts: Record<ChangeStatus, number>;
  changes: AuditChange[];
}
export function compareAudits(
  previous: Audit,
  current: Audit,
): AuditComparison {
  const oldPages = new Map(previous.pages.map((p) => [p.url, p]));
  const newPages = new Map(current.pages.map((p) => [p.url, p]));
  const oldFindings = new Map(previous.findings.map((f) => [f.id, f]));
  const newFindings = new Map(current.findings.map((f) => [f.id, f]));
  const output: AuditComparison = {
    previousId: previous.id,
    currentId: current.id,
    previousDate: previous.createdAt,
    currentDate: current.createdAt,
    compatible:
      (previous.rulesetVersion ?? 1) === (current.rulesetVersion ?? 1),
    coverage: {
      previousPages: oldPages.size,
      currentPages: newPages.size,
      sharedPages: [...oldPages.keys()].filter((u) => newPages.has(u)).length,
      addedPages: [...newPages.keys()].filter((u) => !oldPages.has(u)).length,
      uncheckedPages: [...oldPages.keys()].filter((u) => !newPages.has(u))
        .length,
    },
    counts: { resolved: 0, new: 0, persisting: 0, unverified: 0 },
    changes: [],
  };
  if (!output.compatible) return output;
  for (const id of new Set([...oldFindings.keys(), ...newFindings.keys()])) {
    const old = oldFindings.get(id),
      currentFinding = newFindings.get(id);
    const finding = currentFinding ?? old!;
    const oldUrls = new Set(old?.urls ?? []),
      newUrls = new Set(currentFinding?.urls ?? []);
    const successful = (url: string) => {
      const p = newPages.get(url);
      return p && p.status >= 200 && p.status < 300;
    };
    const duplicateCoverageComplete =
      id !== "duplicate-title" || [...oldUrls].every(successful);
    for (const url of new Set([...oldUrls, ...newUrls])) {
      let status: ChangeStatus;
      if (newUrls.has(url)) status = oldUrls.has(url) ? "persisting" : "new";
      else if (!successful(url)) status = "unverified";
      // A duplicate may disappear only because the other page wasn't scanned.
      else if (!duplicateCoverageComplete) status = "unverified";
      else status = "resolved";
      output.counts[status]++;
      output.changes.push({
        findingId: id,
        title: finding.title,
        severity: finding.severity,
        url,
        status,
        newlyDiscovered: !oldPages.has(url),
      });
    }
  }
  output.changes.sort(
    (a, b) =>
      a.url.localeCompare(b.url) || a.findingId.localeCompare(b.findingId),
  );
  return output;
}
