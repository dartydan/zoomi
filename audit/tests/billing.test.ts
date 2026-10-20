import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Stripe from "stripe";
const directory = mkdtempSync(join(tmpdir(), "audit-billing-"));
process.env.AUDIT_DATA_DIR = directory;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test_fixture";
process.env.STRIPE_PRICE_ID = "price_test_fixture";
const { db } = await import("../server/database.ts");
const { webhook, entitled } = await import("../server/billing.ts");
const sdk = new Stripe("sk_test_local_fixture");
let current: unknown[] = [];
let calls = 0;
let failure = false;
const client = {
  webhooks: sdk.webhooks,
  subscriptions: {
    list: async () => {
      calls++;
      if (failure) throw new Error("Temporary provider failure");
      return { data: current };
    },
  },
} as unknown as Pick<Stripe, "webhooks" | "subscriptions">;
function event(id: string, type = "invoice.paid") {
  const body = Buffer.from(
    JSON.stringify({ id, type, data: { object: { customer: "cus_fixture" } } }),
  );
  const signature = sdk.webhooks.generateTestHeaderString({
    payload: body.toString(),
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { body, signature };
}
function paid() {
  return [
    {
      id: "sub_fixture",
      status: "active",
      items: { data: [{ price: { id: "price_test_fixture" } }] },
      latest_invoice: { status: "paid" },
    },
  ];
}
db.prepare(
  "INSERT INTO billing(owner_id,customer_id,status,updated_at) VALUES(?,?,?,?)",
).run("owner", "cus_fixture", "inactive", new Date().toISOString());
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("invalid signatures cannot grant subscription access", async () => {
  const e = event("evt_invalid");
  await assert.rejects(() => webhook(e.body, "invalid", client));
  assert.equal(calls, 0);
  assert.equal(entitled("owner"), false);
});
test("a signed paid event grants access only for the configured recurring plan, and retries are deduplicated", async () => {
  current = paid();
  const e = event("evt_paid");
  await webhook(e.body, e.signature, client);
  assert.equal(entitled("owner"), true);
  assert.equal(calls, 1);
  await webhook(e.body, e.signature, client);
  assert.equal(calls, 1);
});
test("a delayed paid event cannot restore a cancelled subscription", async () => {
  current = [];
  const e = event("evt_delayed_paid");
  await webhook(e.body, e.signature, client);
  assert.equal(entitled("owner"), false);
});
test("unpaid invoices and unrelated plans do not grant access", async () => {
  current = [{ ...paid()[0], latest_invoice: { status: "open" } }];
  let e = event("evt_unpaid");
  await webhook(e.body, e.signature, client);
  assert.equal(entitled("owner"), false);
  current = [
    { ...paid()[0], items: { data: [{ price: { id: "price_another" } }] } },
  ];
  e = event("evt_wrong_plan");
  await webhook(e.body, e.signature, client);
  assert.equal(entitled("owner"), false);
});
test("provider errors leave an event retryable instead of acknowledging lost state", async () => {
  const e = event("evt_retry");
  failure = true;
  await assert.rejects(() => webhook(e.body, e.signature, client), /Temporary/);
  assert.equal(
    db.prepare("SELECT id FROM stripe_events WHERE id=?").get("evt_retry"),
    undefined,
  );
  failure = false;
  current = paid();
  await webhook(e.body, e.signature, client);
  assert.equal(entitled("owner"), true);
});
