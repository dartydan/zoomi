# Audit by Zoomi — audit.zoomi.co

A customer SaaS application for business owners: private accounts, verified website projects, background website audits, Google Search Console and Analytics connections, guided fixes, and subscription access.

**Target: https://audit.zoomi.co.** The studio site at the repository root is separate. DNS currently points the Audit subdomain to `online.seranking.com`; this branch does not change that record.

## Run

Node 22.13+ within Node 22 is required. The npm scripts use npm’s Node executable so the older marketing project’s bundled Node cannot take precedence.

```sh
cd audit
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Next.js serves the interface and API on the same port; Workflow runs crawl batches. Create a private account, add a website, connect/verify it, then subscribe to run audits. The development interface does not substitute sample data or automatically grant paid access. Production email verification is required; local development does not send verification mail. Password recovery requires email delivery configuration in either environment.

Copy values from `.env.example` into the deployment platform's secret store. A local `.env` is also supported and is ignored by Git. For development, set `APP_URL=http://127.0.0.1:5173`, omit `NODE_ENV=production`, and use a writable local `AUDIT_DATA_DIR`. Do not use production credentials for local tests.

```sh
npm test        # audit, crawl, account isolation, access, encryption, and OAuth tests
npm run build   # TypeScript validation and production Next.js/Workflow build
npm start       # serve the built application; set APP_URL for the actual address
```

## Implemented

- Better Auth email/password signup, sign-in, sign-out, sessions, verification, and password-recovery email integration.
- Owner-scoped projects, audits, jobs, tasks, OAuth connections, imported metrics, and research reports. No shared anonymous workspace.
- Website ownership through Google Search Console owner/full access, a website meta tag, or DNS TXT.
- PostgreSQL storage, atomic quotas and billing reconciliation, indexed owner queries, and fenced worker leases.
- Durable Vercel Workflow jobs with progress, cancellation, bounded batches, checkpoints, duplicate-run coordination, and cron dispatch recovery.
- Daily, weekly, and monthly audit/Google refresh/rank-check schedules with customer timezones, daylight-saving handling, pause controls, and activity history. Scheduled audits share the normal concurrency and monthly quotas.
- Sitemap and internal-link discovery, robots policy checks, crawl delays, up to 10,000 pages per job, and explicit partial coverage.
- Ten evidence-backed audit issue groups and a weighted foundational score. Marking a task done never changes the measured score.
- Page-level comparisons between consecutive scans: verified fixes, new findings, persistent issues, and issues that could not be rechecked. Different rulesets do not produce misleading comparisons.
- Google OAuth with PKCE, expiring one-use session-bound state, encrypted refresh tokens, read-only scopes, property selection, and disconnect/revocation.
- Search Console clicks, impressions, queries, page data, and average positions. Analytics visitors, sessions, key events, and pageviews. Refresh manually or on a saved schedule. Disconnecting or changing properties prevents an older refresh from restoring stale data.
- Keyword rank tracking with private history, country/device controls, organic-result coverage, competitor positions, pause controls and recurring schedules.
- Backlink totals, live/lost link lists, referring domains, anchor/follow details, net snapshot comparisons and CSV exports.
- Competitor watchlists, discovery, organic visibility, strongest pages, missing/shared/weaker keywords and one-click transfer to rank tracking.
- Durable DataForSEO jobs with daily deduplication, shared atomic request caps, partial reports and no automatic replay of uncertain paid calls. [Feature limits and activation](docs/SEARCH-DATA.md).
- Stripe subscription Checkout, customer portal, signature-verified lifecycle webhooks, replay protection, and server-enforced entitlements. No free trial is configured.
- Responsive account, project, connection, audit, action, content-template, ranking, backlink, competitor, comparison, and history screens. Exportable Markdown plans and reports.

## Activation still required

The code does not imply that provider accounts are connected. A dedicated PostgreSQL database, Google OAuth credentials, Stripe price/keys/webhook, a verified transactional email sender, and the optional licensed research provider have not been configured in this workspace. Live consent, email delivery, subscription lifecycle, and provider-data import must be verified with those accounts before launch. Production startup fails if required launch settings are missing.

The server has been exercised locally; it has not been deployed to audit.zoomi.co. Review [the launch runbook](docs/LAUNCH.md) and [the product plan](docs/PRODUCT-PLAN.md).

## Operating model and current limits

This release targets **Vercel with a dedicated PostgreSQL database**. It uses Node 22, Next.js and Vercel Workflow. Production accounts and reports never depend on local disk. Local development uses PGlite (PostgreSQL compiled to WebAssembly), not a production database. Run schema migrations against each new environment before serving requests.

The connected Vercel team currently reports Hobby. The owner will upgrade when launch needs it; development continues in this workspace without a plan change. A commercial launch needs Pro; the ten-minute recovery cron also requires support for that frequency. The existing account includes a Supabase integration, but no Audit database has been provisioned or connected. See [hosting and account findings](docs/HOSTING.md).
Initial server-enforced allowances are 5 websites, 30 audits per calendar month, and 10,000 pages per audit. These are configuration defaults, not a settled commercial pricing offer. The crawl engine has functional coverage beyond the old 12-page sample and restart tests; a 10,000-page production load test has not been performed.

Crawls read server-returned HTML without browser JavaScript. Query-string URLs, common downloads, more than 100 sitemaps, and overlarge pages are bounded. Skipped pages and remaining URLs are reported. A completed discovered queue does not prove every page on the internet was found. Rendered crawling, exhaustive link/resource checks, full schema validation, Core Web Vitals and full search-provider feature parity are not implemented. The content studio currently builds structured templates, not AI-researched drafts.

Google connections use the first page of account summaries (up to 200) and up to 1,000 page rows per sync; query rows are capped at 100. Provider limitations and anonymized queries also affect completeness. Search Console average position is not a location-specific rank measurement. A missing noindex directive does not prove Google indexing.

## Security and operations

Authentication is handled by Better Auth. Application ownership checks run on every project route. Crawl destinations are limited to public IP addresses, validated DNS results are pinned to outbound connections, redirect destinations are checked, responses/timeouts are bounded, and active crawl concurrency is limited. Host/Origin checks and application/auth rate limits protect write paths. Production cookies are secure and HTTP-only. Tokens use AES-GCM encryption with a separate secret.

Runtime data and secrets are ignored by Git. Configure managed PostgreSQL backups and verify a restore in a separate environment. Use the provider's pooled connection URL for runtime and a direct connection URL for migrations when required. Never put database credentials in browser environment variables.

```sh
npm run db:migrate # with the target environment's secrets and DATABASE_URL set
```

Keep the token-encryption secret recoverable in the platform secret store. Losing it means customers must reconnect Google. Never print provider secrets or request bodies containing credentials to logs.

## Structure

- `src/`: customer interface and shared data types
- `server/auth.ts`: maintained authentication provider and account emails
- `server/database.ts`, `schema.ts`: PostgreSQL adapter, schema, and scoped access
- `server/crawler.ts`, `jobs.ts`, `workflows/audit.ts`: bounded crawling, checkpoint leases, and durable execution
- `server/network.ts`, `analyze.ts`: network protections and evidence rules
- `server/google.ts`, `billing.ts`, `research.ts`: real provider integrations
- `server/seo*.ts`, `workflows/seo.ts`: keyword/watchlist management, licensed data adapters, private research routes and durable search-data jobs
- `server/recurrence.ts`, `schedules.ts`, `workflows/google.ts`: customer schedules, admission checks, and durable refreshes
- `server/comparison.ts`: comparison evidence and coverage-aware fix verification
- `tests/`: executable regression and access-isolation tests
- `docs/`: product evidence and deployment/cutover instructions

## GitHub checks

The ready-to-install workflow is in `docs/setup/audit-checks.example.yml`. The authenticated GitHub token lacks the `workflow` scope, so this branch preserves it as a template instead of changing `.github/workflows`. Once authorized, copy it to `.github/workflows/audit-checks.yml`; its Node 22 job runs the test suite and production build. Local validation was completed independently.
