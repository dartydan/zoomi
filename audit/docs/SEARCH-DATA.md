# Zoomi-owned search intelligence

The owner has chosen to make Audit the data collector. No third-party SEO aggregation or backlink-data service is used. The network transport and admission paths for licensed SEO requests have been removed. Old credentials cannot enable them. Historical reports, saved keywords and competitor watchlists remain readable; queued legacy research fails without contacting an aggregator.

## Working collection path

- Every new website audit also records page and outgoing-link evidence in Audit’s database.
- Backlinks lets a customer save up to 25 additional public source websites/pages. Competitor watchlists support five domains. The verified website itself is also a source.
- Customers choose a saved source and a 100–10,000 page crawl allowance. Research shares the existing account limit of 30 crawls per UTC calendar month with audits. These are initial operational limits, not settled product pricing.
- The crawler collects static HTML, discovers same-origin links and sitemap URLs, respects robots rules and crawl delays, and uses bounded requests, public-IP checks, pinned DNS and redirect validation. Collection jobs stay on the chosen domain (with www equivalence); they do not fan out across the web automatically.
- Fenced Workflow batches save crawl progress and evidence in one database transaction. Duplicate completion is safe; cancellation prevents late checkpoints. A five-minute domain lease coordinates concurrent customers targeting the same host. The runtime retains the audit recovery outbox/cron.
- Page evidence includes URL, title, description, H1 headings, word count, HTTP status, noindex flag and actual page observation time. The UI paginates results and exports the current result page.
- Link evidence includes source URL, destination URL, anchor, rel attributes and first seen/last seen/last checked times. Duplicate links to a destination on one source page are collapsed; rel flags are combined conservatively. Incoming-link reports match the customer’s exact domain/subdomains and exclude internal links.
- Only a successfully rechecked source page with a complete link extraction can establish that a previously observed link is now missing. Unvisited, failed, blocked or truncated pages do not imply lost links. Reappearance retains first seen; older observations cannot replace newer evidence.
- Page/link evidence is scoped to the owning project. Google analytics, tokens and customer research are never shared between accounts. No shared public index or customer-data reuse is implied.

## Honest boundaries

This is the first owned collection layer, not a finished global search index. Backlinks are observations within the pages visited, not total backlinks across the web. Crawling a customer’s own site cannot discover all pages that link to it. Customers can seed relevant directories, partners and known referring pages; broad discovery is future work.

Competitor pages show content evidence, not search rankings, keyword volumes, traffic estimates, difficulty or authority scores. HTML titles and headings are not relabeled as ranking keywords. The crawler does not execute JavaScript, does not crawl query-string pages, caps extraction at 500 distinct link destinations per page (with a truncation flag), and uses the existing 2 MB response limit. Old audits are not retroactively treated as complete link evidence; run a fresh crawl.

Saved rank lists and schedule preferences remain available, but new rank checks are explicitly unavailable. The existing Google connection supplies customer-authorized Search Console average positions; those are not device/location-specific SERP observations. A reliable direct search-result collector, regional execution, parsing with blocked/empty-response detection and coverage-aware observations still need implementation and validation. Do not substitute fake positions or silently re-enable paid APIs.

## Next collection stages

1. Crawl-frontier expansion, deterministic recrawl schedules, crawl-event history, parser versions and a measured retention policy.
2. A separately governed public link graph with proven ownership/privacy separation, domain-wide scheduling, removal controls and scalable storage. Current tables are intentionally project-private.
3. Direct search-result observations with explicit source, timestamp, engine, country/device and coverage. Confirm permitted collection before production operation; stop on challenges instead of reporting empty rankings. Google’s [published automated traffic policy](https://developers.google.com/search/docs/essentials/spam-policies#machine-generated-traffic) and [robots standard](https://www.rfc-editor.org/rfc/rfc9309.html) inform access handling.
4. Derived competitor overlap, link opportunities and content comparisons based on measured coverage. Demand and traffic metrics require independent evidence.

## Hosting, costs and validation

No data-provider account, API credit or SEO subscription is required. Owned collection instead consumes crawler execution, bandwidth, database/index storage and operational effort. Do not promise a per-site cost before measuring representative workloads. The existing local workspace and Vercel app remain the starting point; a broad internet index will require additional capacity planning. No infrastructure has been purchased or upgraded.

Run the explicit migration before production deployment. Tests use injected HTML transports and isolated temporary databases, covering extraction, link disappearance/reappearance, source/owner isolation, robots denial, redirect scope, host leases, cancellation, retries and aggregator retirement. Real production storage, Workflow throughput, large-crawl cost, retention and live search-result collection still require validation.

## Validation of this change

All 70 automated checks and the production Next.js/Workflow build pass. A live, isolated crawl of `https://zoomi.co/` completed and indexed three discovered pages and six link records; its temporary test database was removed afterward. This proves direct collection and storage on a small real site, not broad backlink coverage or 10,000-page capacity. Browser inspection of the updated screens was blocked by the desktop browser URL policy, so visual verification remains outstanding.
