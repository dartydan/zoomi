import Stripe from "stripe";
import { createHash } from "node:crypto";
import { db } from "./database.ts";
import { appUrl, limits } from "./config.ts";
export const billingReady = () =>
  !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_PRICE_ID &&
    process.env.STRIPE_WEBHOOK_SECRET
  );
const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error(
      "Subscription billing has not been activated by Zoomi yet.",
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20000,
  });
};
interface Billing {
  owner_id: string;
  customer_id: string | null;
  subscription_id: string | null;
  status: string;
  updated_at: string;
}
export function subscription(owner: string) {
  return db.prepare("SELECT * FROM billing WHERE owner_id=?").get(owner) as
    | Billing
    | undefined;
}
export const entitled = (owner: string) =>
  subscription(owner)?.status === "active";
export async function checkout(owner: string, email: string) {
  if (!billingReady())
    throw new Error(
      "Subscription billing has not been activated by Zoomi yet.",
    );
  const api = stripe();
  let row = subscription(owner);
  if (row?.status === "active")
    throw new Error(
      "Your subscription is already active. Use Manage subscription to make changes.",
    );
  if (!row?.customer_id) {
    const customer = await api.customers.create(
      { email },
      { idempotencyKey: `audit-customer-${owner}` },
    );
    db.prepare(
      "INSERT INTO billing(owner_id,customer_id,status,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET customer_id=excluded.customer_id",
    ).run(owner, customer.id, "inactive", new Date().toISOString());
    row = subscription(owner);
  }
  const customer = row!.customer_id!;
  const existing = await api.subscriptions.list({
    customer,
    status: "all",
    limit: 100,
  });
  if (
    existing.data.some(
      (s) =>
        !["canceled", "incomplete_expired"].includes(s.status) &&
        s.items.data.some((i) => i.price.id === process.env.STRIPE_PRICE_ID),
    )
  ) {
    return (
      await api.billingPortal.sessions.create({ customer, return_url: appUrl })
    ).url;
  }
  const pending = await api.checkout.sessions.list({
    customer,
    status: "open",
    limit: 100,
  });
  const reusable = pending.data.find(
    (s) =>
      s.mode === "subscription" &&
      s.metadata?.audit_price === process.env.STRIPE_PRICE_ID &&
      s.url,
  );
  if (reusable) return reusable.url;
  const attempt = `audit-checkout-${owner}-${Math.floor(Date.now() / 600000)}`;
  // Retries must send the same body for Stripe's idempotency key.
  const suffix = Array.from(
    createHash("sha256").update(attempt).digest().subarray(0, 8),
    (n) => String.fromCharCode(97 + (n % 26)),
  ).join("");
  const session = await api.checkout.sessions.create(
    {
      mode: "subscription",
      customer: row!.customer_id!,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      integration_identifier: `zoomi-audit-${suffix}`,
      metadata: { audit_price: process.env.STRIPE_PRICE_ID! },
    },
    { idempotencyKey: attempt },
  );
  return session.url;
}
export async function billingPortal(owner: string) {
  const row = subscription(owner);
  if (!row?.customer_id) throw new Error("No billing account exists yet.");
  return (
    await stripe().billingPortal.sessions.create({
      customer: row.customer_id,
      return_url: appUrl,
    })
  ).url;
}
export async function planInfo() {
  if (!billingReady()) return { configured: false, limits };
  const price = await stripe().prices.retrieve(process.env.STRIPE_PRICE_ID!);
  return {
    configured: true,
    limits,
    amount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
  };
}
const customerLocks = new Map<string, Promise<void>>();
export async function webhook(
  body: Buffer,
  signature: string,
  api: Pick<Stripe, "webhooks" | "subscriptions"> = stripe(),
) {
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    throw new Error("Billing webhook is not configured.");
  const event = api.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (db.prepare("SELECT id FROM stripe_events WHERE id=?").get(event.id))
    return;
  const supported =
    event.type.startsWith("customer.subscription.") ||
    [
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ].includes(event.type);
  if (supported) {
    const object = event.data.object as unknown as {
      customer?: string | { id: string };
    };
    const customer =
      typeof object.customer === "string"
        ? object.customer
        : object.customer?.id;
    if (customer) {
      const prior = customerLocks.get(customer) ?? Promise.resolve();
      const current = prior
        .catch(() => {})
        .then(async () => {
          const row = db
            .prepare("SELECT * FROM billing WHERE customer_id=?")
            .get(customer) as Billing | undefined;
          if (!row) return;
          // Read current Stripe state, so delayed or replayed lifecycle events cannot restore a cancelled entitlement.
          const subs = await api.subscriptions.list({
            customer,
            status: "all",
            limit: 100,
            expand: ["data.latest_invoice"],
          });
          const active = subs.data.find(
            (s) =>
              s.status === "active" &&
              s.items.data.some(
                (i) => i.price.id === process.env.STRIPE_PRICE_ID,
              ) &&
              typeof s.latest_invoice === "object" &&
              s.latest_invoice?.status === "paid",
          );
          db.prepare(
            "UPDATE billing SET subscription_id=?,status=?,updated_at=? WHERE customer_id=?",
          ).run(
            active?.id ?? null,
            active ? "active" : "inactive",
            new Date().toISOString(),
            customer,
          );
        });
      customerLocks.set(customer, current);
      try {
        await current;
      } finally {
        if (customerLocks.get(customer) === current)
          customerLocks.delete(customer);
      }
    }
  }
  db.prepare("INSERT OR IGNORE INTO stripe_events VALUES(?,?)").run(
    event.id,
    new Date().toISOString(),
  );
}
