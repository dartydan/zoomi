# Launch Audit on audit.zoomi.co

## Domain and existing service

Cloudflare was inspected on October 20, 2026 using the `cf` CLI. The existing record is:

- Name: `audit.zoomi.co`
- Type: CNAME
- Destination: `online.seranking.com`
- TTL: 300 seconds
- Proxy: off

No DNS record has been changed. This is a replacement of the existing SE Ranking white-label service, not a new route on the marketing homepage. All app routes, account pages, API calls, Google callbacks, and billing callbacks are on `https://audit.zoomi.co`.

## Activation checklist for Zoomi

1. **Confirm the hosting approach.** A new hosting vendor is not inherently required. The current build runs Node 22 and needs a durable disk volume for SQLite. It can use an existing compatible server with one instance. Alternatively, adapt storage and background jobs to Cloudflare Workers, D1, R2, and Queues in the existing Cloudflare account. The current code is not yet compatible with that runtime. Review [the hosting assessment](HOSTING.md) before provisioning anything. The Dockerfile is supplied; it has not yet been built or deployed here. Set the public URL to `https://audit.zoomi.co` and route HTTPS to the application. Cloudflare can provide the domain routing. Use `cf` for Cloudflare operations because this project has no Wrangler configuration.
2. **Create the Zoomi Google application.** Enable Search Console, Google Analytics Admin, and Google Analytics Data APIs. Configure a web OAuth client and the consent screen, including privacy/support details. Request only `webmasters.readonly` and `analytics.readonly`. Add `https://audit.zoomi.co/api/google/callback` as the exact authorized redirect URI. Complete Google's required consent/verification process before offering access generally. Test with an authorized Google account first. Customers must grant their own access; SE Ranking's existing OAuth grants cannot simply be reused by a different app.
3. **Configure account email.** Use a verified sender with the configured transactional email provider. Test signup verification, expired links, password recovery, and delivery errors. Store provider keys in the server's secret manager.
4. **Configure Stripe.** Use a separate Stripe sandbox for integration checks. Decide the monthly/annual offer. Create a Product for the plan and its recurring Price; set the Price ID on the server. Use a restricted key with only the permissions needed for Customers, Checkout, subscriptions, prices, and the customer portal. Enable/configure the portal. Register `https://audit.zoomi.co/api/billing/webhook` for subscription lifecycle events, invoice paid/failed, Checkout completed, and asynchronous Checkout success/failure. Keep the signing secret private. Review tax registrations and the appropriate [Stripe Tax setup](https://docs.stripe.com/billing/taxes/collect-taxes) before live charging; this build does not silently enable tax collection.
5. **Activate licensed research if included.** Configure the selected provider and a hard daily request cap only after the budget is approved. This build includes a DataForSEO keyword-gap adapter. No provider subscription has been purchased and no paid search requests have been sent by this work.
6. **Set platform secrets and a backup policy.** Set independent random authentication and encryption secrets, each at least 32 characters. Use a persistent volume. Back up SQLite with the supplied online backup script. Restore into a separate environment and verify account/project access before launch.

## Required validation before cutover

- Register two customers, verify their email, sign in/out, reset passwords, and confirm session isolation.
- Create separate website projects. Verify that one customer cannot read or change the other's audits, jobs, task state, metrics, OAuth state, or research.
- Authorize Google in the real consent flow. Confirm accessible properties, domain matching, data timestamps, partial permission handling, token refresh, disconnect, and revocation.
- Run a representative large crawl, stop/restart the service, and verify that it resumes. Test cancellation, disallowed robots, sitemaps, HTTPS/redirect rules, private-network rejection, timeouts, and partial reports.
- Complete sandbox checkout and test payment failure, renewal, cancellation, delayed/out-of-order events, duplicate events, and portal access. Paid capabilities must follow server state, never the return URL.
- Test provider quotas and spend caps. Confirm unavailable metrics stay unavailable.
- Review existing SE Ranking projects and customers. Export the data that must be retained before cancelling the old service. Plan invitations and reconnection for existing customers; this branch does not import SE Ranking accounts or passwords.
- Check mobile/desktop flows, error recovery, email text, public support/privacy/terms pages, and the actual commercial allowances.

## Cutover and rollback

Deploy and validate the complete service at a protected staging address first, with separate test credentials and its own callback URLs. Update the production configuration to the exact Audit subdomain. Obtain approval for the reviewed deployment and any provider spending, then change only the `audit.zoomi.co` DNS destination. The `zoomi.co` marketing site's DNS and GitHub Pages settings do not change.

Retain the existing CNAME destination as the rollback value and keep the SE Ranking service available during transition. If the new service is unhealthy, restore the CNAME to `online.seranking.com` and investigate without deleting the new database. DNS rollback does not undo subscriptions or data changes; reconcile those separately.

## Current evidence

Automated checks cover account isolation, login/logout, payment/ownership gating, OAuth state binding, token encryption/tampering, public-network validation, sitemap crawling beyond twelve pages, checkpoint resume, and audit scoring. A real public crawl of zoomi.co also completed. OAuth token exchange, Google data import, live email, Stripe lifecycle delivery, large production load, Docker deployment, and DNS cutover have not been validated because the corresponding provider setup and production origin are not yet supplied.

On October 20, the Node 22 production build and all 30 automated tests passed, including signed Stripe event fixtures and interruption/resume behavior. These fixtures do not replace testing in a real Stripe sandbox. Browser checks covered signup, private project creation, subscription gating, connection setup, saved real crawl results, and desktop/mobile layouts.
