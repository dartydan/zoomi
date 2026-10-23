import { test } from "node:test";
import assert from "node:assert/strict";
import { compareAudits } from "../server/comparison";
import type { Audit, Finding, PageResult } from "../src/types";
const page = (url: string, status = 200): PageResult => ({
  url,
  status,
  title: "Title",
  description: "Description",
  h1: ["Heading"],
  wordCount: 500,
  images: 0,
  missingAlt: 0,
  canonical: url,
  noindex: false,
  viewport: true,
  schema: true,
  invalidSchema: false,
  links: [],
});
const finding = (id: string, urls: string[]): Finding => ({
  id,
  urls,
  title: id,
  category: "Content",
  severity: "medium",
  why: "Reason",
  steps: [],
  effort: "Short",
  weight: 2,
});
const audit = (
  id: string,
  pages: PageResult[],
  findings: Finding[],
): Audit => ({
  id,
  url: "https://example.com",
  createdAt: id === "before" ? "2026-01-01" : "2026-01-02",
  score: 80,
  pages,
  findings,
  completed: [],
  limit: 10000,
  skipped: [],
  rulesetVersion: 1,
});
test("comparisons separate verified fixes, persistent findings, new issues and unchecked pages", () => {
  const old = audit(
    "before",
    ["a", "b", "c", "d"].map((u) => page(u)),
    [finding("description", ["a", "b", "c", "d"])],
  );
  old.completed = ["description"];
  const current = audit(
    "after",
    [page("a"), page("b"), page("d", 500), page("e")],
    [finding("description", ["b", "e"])],
  );
  const result = compareAudits(old, current);
  assert.deepEqual(result.counts, {
    resolved: 1,
    new: 1,
    persisting: 1,
    unverified: 2,
  });
  assert.deepEqual(result.coverage, {
    previousPages: 4,
    currentPages: 4,
    sharedPages: 3,
    addedPages: 1,
    uncheckedPages: 1,
  });
  assert.equal(
    result.changes.find((c) => c.url === "e")?.newlyDiscovered,
    true,
  );
  assert.equal(result.changes.find((c) => c.url === "b")?.status, "persisting");
});
test("a duplicate title is not declared fixed when its matching page was omitted", () => {
  const old = audit(
    "before",
    [page("a"), page("b")],
    [finding("duplicate-title", ["a", "b"])],
  );
  const partial = compareAudits(old, audit("after", [page("a")], []));
  assert.deepEqual(partial.counts, {
    resolved: 0,
    new: 0,
    persisting: 0,
    unverified: 2,
  });
  assert.equal(
    compareAudits(old, audit("after", [page("a"), page("b")], [])).counts
      .resolved,
    2,
  );
});
test("different rulesets do not produce misleading comparison totals", () => {
  const old = audit("before", [page("a")], [finding("description", ["a"])]);
  const current = { ...audit("after", [page("a")], []), rulesetVersion: 2 };
  const result = compareAudits(old, current);
  assert.equal(result.compatible, false);
  assert.equal(result.changes.length, 0);
});
