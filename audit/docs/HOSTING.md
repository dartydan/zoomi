# Hosting Audit under audit.zoomi.co

## What is needed

The address stays **audit.zoomi.co**. A domain routes visitors; the application still needs computing and persistent storage for customer accounts, reports, Google connections, billing updates, and background website crawling.

Today the root marketing site uses GitHub Pages, and Audit's Cloudflare CNAME points to `online.seranking.com`. SE Ranking supplies the existing service's application infrastructure. Replacing that service means supplying our own infrastructure, but does **not** necessarily mean buying a different hosting provider.

## Existing Cloudflare account

Read-only `cf` CLI inspection on October 20, 2026 found no Workers, D1 databases, or Queues in the active account. The tools authenticated and returned empty resource lists; no resources, billing settings, or DNS records were changed.

Cloudflare supports frontend and backend applications with persistent data and background work. See its [web application architecture documentation](https://developers.cloudflare.com/use-cases/web-apps/) and [storage options](https://developers.cloudflare.com/workers/platform/storage-options/).

A reasonable Cloudflare deployment design is:

- Workers: frontend assets, account/API requests, Google callbacks, and Stripe webhooks.
- D1: customers, sessions, project ownership, billing state, audit metadata, and job status.
- R2: larger crawl evidence and downloadable reports.
- Queues or Workflows: batches of crawl work with retries, cancellation, and progress.

This is a proposed target, not an activated or validated deployment. Cloudflare services can incur usage charges; an existing DNS account does not establish that all application services are included in its current plan.

## Why the current build needs adaptation

The working implementation uses Node, a native SQLite library with a disk file, and one continuously running crawl worker. Workers' [filesystem is temporary](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/), so that database file cannot simply be uploaded and treated as persistent storage.

Adapting it requires replacing the database adapter and transactions, moving large report bodies to object storage, dividing crawls into durable background batches, revisiting outbound-fetch and DNS protections for the runtime, and validating authentication/Google/Stripe packages there. Audit evidence, the customer interface, and most business rules can be retained. Run the same account-isolation, billing, and recovery checks against the Cloudflare version before cutover.

Using an existing compatible Node server is another option and requires less code change. A separate managed hosting vendor is optional. No new subscription or server has been purchased.
