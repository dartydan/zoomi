# Search intelligence

Audit now includes keyword rank tracking, backlink analysis, and saved competitor research. The customer interface, private records, background jobs and tests are implemented. Live provider access has not been activated or exercised; no paid requests were sent during development.

## What customers can do

- Save up to 50 active keyword/country/device combinations per website; pause, resume or remove them. Pausing preserves history; removing deletes it after confirmation. Up to 200 saved combinations, including paused ones.
- Check Google organic positions for English searches in the US, UK, Canada or Australia on desktop or mobile. Each check requests depth 100, matches the website and its subdomains, and stores actual returned coverage, the leading ten organic results, and positions for up to five saved competitors. Ads and other SERP features do not count as organic positions.
- Review up to 90 saved checks per keyword, compare the two most recent positions, and schedule daily, weekly or monthly checks in the customer’s timezone. Missing results remain null, never position zero or an assumed position outside the top 100.
- Save backlink totals and provider strength estimates; browse up to 100 live backlinks, 100 referring domains and 100 explicitly lost backlinks per check. Inspect anchors, destinations, follow status, broken-link flags and last-seen dates. Internal backlinks are excluded and subdomains are included. Compare totals with an earlier complete report as net changes, not counts of newly acquired or lost links.
- Save five competitors, discover up to 20 organic search competitors, and research each competitor’s domain visibility, up to 50 strongest pages, up to 100 ranked keywords, 100 missing keywords and 100 shared keywords. The weaker-ranking view filters that shared-keyword sample. Add a research keyword to desktop rank tracking in the report’s country.
- Filter, paginate and export displayed research to CSV. Formula-like spreadsheet cells are escaped. Saved reports remain readable if a subscription becomes inactive.

These are bounded views of a licensed provider’s index, not exhaustive competitor inventories. Research traffic and search volumes are estimates, not analytics from the competitor’s account. Device-specific rank checks are distinct from Search Console’s averaged positions. Research reports display their collection time; keyword exports also retain the provider’s keyword-data update time. Backlink discovery timestamps are provider observations, not necessarily creation dates.

## Activation

Use the existing Vercel workspace. There is no hosting migration or automatic plan upgrade in this change. Production also requires the database and launch configuration described in LAUNCH.md.

Set these server-only environment values after the owner approves provider access and a spend budget:

```
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
DATAFORSEO_DAILY_REQUEST_LIMIT=0
DATAFORSEO_USER_DAILY_REQUEST_LIMIT=100
DATAFORSEO_BACKLINKS_ENABLED=false
```

A platform limit of zero disables external requests. Backlinks require a separate explicit enable flag because provider product access must be checked. Every new report requires an active subscription and verified website ownership. Customers can save keyword/watchlist/schedule preferences before activation.

The caps count **requests, not dollars**. One rank keyword consumes one request; discovery uses one, backlinks four, and a competitor profile six. A depth-100 SERP call can be billed for multiple result pages. Establish the spend ceiling in the provider account, confirm its current endpoint/depth prices and product access, then choose platform and customer caps. Do not infer a monetary maximum from request counts. All modules, including the older keyword-gap endpoint, share the same atomic platform/customer allowance. Failed and uncertain attempts count too. Allowances reset at midnight UTC.

## Reliability and storage

`tracked_keywords`, `rank_observations`, `competitors`, `seo_jobs`, and additional `provider_calls` columns are created by the existing idempotent migration. Run the migration before deploying this change against an existing production database. All customer routes first authenticate and verify project ownership. Job reads/cancellation and keyword history also check the record’s owner/project.

One search-data job per account can be active at a time. Each Vercel Workflow step handles one bounded provider request with a five-minute fenced lease. The cron outbox recovers interrupted dispatch and expired leases. Deterministic workflow hooks reject duplicate active runs. Request results are saved before job checkpoints. Recovery can reuse a successful result after a crash; a pending/uncertain paid attempt is **never automatically submitted again**. This can leave a section unavailable after a network or storage failure; the UI explains that a fresh check can be requested tomorrow.

Jobs with matching parameters reuse the saved UTC-day report. Rank requests additionally deduplicate per keyword/day even when the list changes. A running rank job uses its admission-time keyword and competitor list. Pausing schedules/keywords affects future admission. Cancelling a job prevents subsequent steps and fences late writes; an already submitted provider request may still be billed. Paid access and ownership verification are rechecked before each step. Partial reports retain successful sections and explicit failures. No failed request is turned into an empty/zero measurement.

Parsed results, not raw SERPs, are stored. Each response has an 8 MB transport bound, URLs and strings are bounded, report rows are capped, and keyword-list responses omit full SERP details. Keyword detail history is bounded to 90 checks and report selectors to 30 recent checks. Older stored records are not automatically purged; establish a retention policy and monitor database size before scale.

## Provider contract references

The integration follows the public DataForSEO v3 contracts:

- [Google organic live advanced](https://docs.dataforseo.com/v3/serp/google/organic/live/advanced/): organic `rank_group`, requested depth and device settings.
- [Backlink summary](https://docs.dataforseo.com/v3/backlinks/summary/live/), [backlink rows](https://docs.dataforseo.com/v3/backlinks/backlinks/live/), and [referring domains](https://docs.dataforseo.com/v3/backlinks/referring_domains/live/): live/lost scopes, subdomains and `one_hundred` rank scale.
- [Competitor discovery](https://docs.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live/): overlapping keywords and full-domain metrics.
- [Domain overview](https://docs.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live/), [relevant pages](https://docs.dataforseo.com/v3/dataforseo_labs/google/relevant_pages/live/), [ranked keywords](https://docs.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live/) and [keyword intersection](https://docs.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live/): saved country-level research datasets.

Before launch, run owner-approved low-volume staging checks with the real provider account, verify billing/depth charges and data shapes against known websites, test Workflow/cron recovery on Vercel, and confirm source dates and unavailable states in the UI. The automated suite uses injected fixture transports and makes no paid calls.
