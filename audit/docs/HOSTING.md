# Hosting Audit on the existing Vercel account

**Customer address: https://audit.zoomi.co. Hosting: Vercel. Domain routing: Cloudflare.** A new hosting vendor is unnecessary.

Audit needs more than frontend hosting: private customer accounts, saved reports, connected Google credentials, billing updates, and jobs that continue scanning large sites. The implementation now uses:

| Component | Purpose |
| --- | --- |
| Next.js on Vercel | Customer screens, login, API requests, Google callbacks, Stripe webhooks |
| Dedicated PostgreSQL database | Accounts, sessions, projects, audit evidence, credentials, billing state |
| Vercel Workflow | Resumable crawl batches, retries and duplicate-run coordination |
| Vercel Cron | Recover jobs whose initial workflow dispatch was interrupted |
| Cloudflare DNS | Route audit.zoomi.co to the validated Vercel deployment |

## Account findings, October 20, 2026

The connected team is `dartydan's projects` (`dartydans-projects`). The account API reports **Hobby**. Vercel's [Hobby documentation](https://vercel.com/docs/plans/hobby) limits it to personal, non-commercial use. Its [pricing page](https://vercel.com/pricing) lists **Pro from $20/month**, with usage charges potentially additional. The ten-minute recovery schedule also needs a plan supporting that frequency; see [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Existing Vercel integrations include Supabase and Upstash. Integration presence does not establish that a suitable database exists or that its credentials are available. Use a separate Audit PostgreSQL database through the existing Supabase account if available; do not reuse another app's tables. Database, email, licensed SEO data, payment processing, and usage costs are separate from the Vercel base plan and remain to be selected/approved.

The empty [zoomi-audit Vercel project](https://vercel.com/dartydans-projects/zoomi-audit) has been created with Next.js, root directory `audit`, and Node 22.x. It has no deployment or domain assignment yet. No plan upgrade, database purchase, production deployment, or DNS change has been performed by this work.

## Current domain

The Cloudflare CNAME `audit.zoomi.co` points to `online.seranking.com`, TTL 300, proxy off. SE Ranking currently supplies the service behind that address. Once the replacement passes staging checks, use Vercel's exact returned DNS target for the cutover. Keep the old destination as the rollback value. The root marketing site remains separate.

## Runtime decisions

Production never stores accounts in Vercel's temporary filesystem. `DATABASE_URL` is mandatory. Development uses local PGlite so the PostgreSQL queries and account flows can be tested without purchasing a service. Production schema migrations are explicit (`npm run db:migrate`), not run on every request.

Each workflow step crawls a bounded batch, saves its checkpoint to PostgreSQL, and continues through Workflow. Database leases prevent duplicate deliveries from overwriting newer work; deterministic workflow hooks prevent concurrent duplicate runs. A signed cron request recovers interrupted dispatches. Reports are delivered in small authenticated chunks to stay within response limits.

The app has built successfully locally and a real public zoomi.co crawl has completed through Workflow. Production PostgreSQL connectivity, Vercel-hosted workflow execution, provider credentials, backups, and the 10,000-page load test still need live validation. See [the launch runbook](LAUNCH.md).
