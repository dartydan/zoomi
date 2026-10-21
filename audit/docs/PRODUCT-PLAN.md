# Audit.zoomi.co — product blueprint

Prepared October 20, 2026. Primary customer: a business owner improving their own website.

## The promise

**Know what is holding your website back, make the next useful improvement, and see whether it helped.**

The product should turn a website into a short, understandable list of actions. The business owner should not need to know what a canonical URL, crawl budget, or keyword difficulty means to make progress. Explain the technical detail inside a finding when it helps them act or hand the work to their website provider.

This is an original implementation informed by publicly documented competitor workflows. It does not use their source code, private algorithms, proprietary datasets, or visual assets.

## What the competitors teach us

| Source | Publicly documented capability | What Audit should adapt | Current implementation |
| --- | --- | --- | --- |
| [SE Ranking Website Audit guide](https://help.seranking.com/hc/en-us/articles/16332618262044-How-to-use-Website-Audit) | Site crawling, technical issues, explanations, reports, and recurring audits | A trustworthy health baseline, page evidence, and repeatable checks | Sitemap/link crawl with a 10,000-page allowance, ten issue groups, explanations, Markdown export, manual reruns and recurring schedules |
| [SE Ranking audit overview](https://help.seranking.com/hc/en-us/articles/18560929519772-Overview-Tab-Interactive-Guide) | Health summary, issue priority, and page-level inspection | Start with the important work; let the owner inspect details as needed | Overview, action plan, and searchable page table |
| [Semrush Keyword Gap](https://www.semrush.com/kb/28-keyword-gap) | Compare competitor keyword coverage, find missing and weak terms, and filter opportunities | “What are customers finding elsewhere that we could answer better?” | Saved competitor profiles, discovery, strongest pages, missing/shared/weaker keywords and transfer to rank tracking; requires licensed provider activation |
| [Semrush SEO Checker](https://www.semrush.com/siteaudit/) | Website scores, prioritized fixes, and technical/on-page assessment | Simple entry point followed by a practical plan | Verified customer websites, evidence-backed findings; no speed/backlink claims |
| [BrightEdge Content Advisor](https://www.brightedge.com/products/content-advisor) | Topic planning, content briefs, draft review, and content refresh recommendations | Give owners a usable writing plan tied to customer needs and existing pages | Template-based briefs; research-backed and AI-assisted briefs are later work |

These are feature observations from public product documentation, not independent validation of the competitors' performance claims. Vendor features can change.

## The owner’s experience

1. Add a website and tell Audit what the business offers and who it serves.
2. Run the first check. Show what was inspected, what could not be inspected, and when.
3. Present three manageable next steps. Each explains the benefit, affected pages, and how to act.
4. Let the owner do it themselves or download instructions for their designer/developer.
5. Recheck the website. Compare the same checks on comparable pages to confirm the change.
6. Add search-performance and enquiry data so improvements can be evaluated against business outcomes.

Use “may help” for recommendations. Never guarantee rankings, revenue, or visibility. An audit score is a diagnostic summary, not proof of business performance.

## Implemented product

The application now includes customer signup/sign-in, private website projects, ownership verification, persistent background audits, checkpoints and cancellation, a guided action plan, saved history, coverage-aware fix comparisons, content templates, Google OAuth, manual and scheduled data sync, recurring audits, subscription checkout/portal/webhook handling, keyword rank tracking with schedules and history, backlink analysis, and deeper competitor research. See [the search-data implementation](SEARCH-DATA.md) for exact limits and activation requirements.

The initial limits are 5 websites, 30 audits per month, and 10,000 pages per audit. These are server defaults, not an approved commercial offer. The product is developed locally; integrations are not activated until Zoomi supplies its own provider accounts and settings. No sample workspace or free trial is used as a substitute for paid customer access.

## Remaining release work

The next gate is provider activation and live validation: Google consent/client configuration, transactional email, Stripe pricing and sandbox lifecycle checks, the licensed SEO-data budget, a persistent production origin, and the domain cutover. See [the concrete launch runbook](LAUNCH.md).

Development continues in the existing workspace; the owner will upgrade the Vercel plan when needed for launch. The deployment target is the existing Vercel account, with remote PostgreSQL and Vercel Workflow. Worker leases fence duplicate deliveries; crawl checkpoints resume across function invocations. Local PostgreSQL-compatible PGlite storage is for development only.

Additional product development: rendered crawling, provider-aware CMS instructions, PDF reports, customer-safe sharing, city-level rank tracking, keyword clustering, expanded backlink exports and outreach workflows, Core Web Vitals, business-outcome prioritization, and AI-assisted briefs grounded in measured data. The current content studio uses structured templates and does not claim to perform AI research.

No price is committed. Measure crawl, search-data, storage, email, payment, and support costs, then choose pricing and allowances. Provider subscriptions require an explicit spending decision.

## Data we own versus data we connect

| Need | Source | Why |
| --- | --- | --- |
| Website HTML, metadata, observed HTTP responses | Our crawler | Directly observable, explainable, repeatable |
| Search clicks, impressions, queries, average positions | Customer-authorized Search Console | First-party search performance |
| Visits and configured conversions | Customer-authorized Analytics | Connect work to observed business outcomes |
| Daily rankings, keyword volumes, competitor coverage | Licensed search-data provider | Requires external collection and index infrastructure |
| Backlinks and referring domains | Licensed backlink index | Website HTML alone cannot reveal all inbound links |
| Draft wording | Optional AI model, grounded in supplied evidence | Helpful assistance; never a source of invented measurements |

Search Console average position must not be presented as a location/device-specific rank tracker. Crawl response time must not be called Core Web Vitals. A page without `noindex` is not necessarily indexed by Google. A page with structured data is not necessarily eligible for rich results.

## Production shape

React/Next.js interface, authenticated Node API, remote PostgreSQL, and durable Vercel Workflow batches. Google credentials are encrypted; every customer query is scoped to its owner. Billing entitlements are enforced on the server from signed Stripe events. The API serves from the same audit.zoomi.co origin as the application.

A public deployment needs Vercel Pro, a dedicated PostgreSQL database, activated providers, and verified backups. It cannot run as static GitHub Pages. Cloudflare's current CNAME points to the SE Ranking white-label platform; switch that record only after service activation and migration review. The root zoomi.co marketing site remains separate. Cloudflare operations use `cf` unless a Wrangler configuration is added later.

## First pilot learning goals

Track time to first completed audit, whether owners understand the first recommendation, actions attempted, fixes confirmed by rechecks, return visits, paid conversion, cost per customer, and support burden. Establish a baseline before setting numeric targets. The most useful success signal is a business owner making a verified improvement and returning to make another.

## Connection reference

[Semrush documents Google Search Console and Analytics connections](https://www.semrush.com/kb/857-google-analytics-and-search-console). Audit follows that customer-authorized, read-only model. Competitor keywords come from a separate licensed source, not from the customer’s Google account.
