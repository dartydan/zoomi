import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) process.loadEnvFile(".env");
export const production = process.env.NODE_ENV === "production";
export const appUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
export const dataDir = resolve(process.env.AUDIT_DATA_DIR ?? "data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
function secret(name: string) {
  if (process.env[name]) return process.env[name]!;
  if (production)
    throw new Error(`${name} must be configured before starting production.`);
  const path = resolve(dataDir, `.${name.toLowerCase()}`);
  if (!existsSync(path))
    writeFileSync(path, randomBytes(32).toString("hex"), { mode: 0o600 });
  return readFileSync(path, "utf8").trim();
}
export const authSecret = secret("BETTER_AUTH_SECRET");
export const encryptionKey = secret("TOKEN_ENCRYPTION_KEY");
if (authSecret.length < 32 || encryptionKey.length < 32)
  throw new Error(
    "Authentication and token encryption secrets must each be at least 32 characters.",
  );
if (production) {
  if (!appUrl.startsWith("https://"))
    throw new Error("APP_URL must use HTTPS in production.");
  for (const name of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    "RESEND_API_KEY",
    "EMAIL_FROM",
  ])
    if (!process.env[name])
      throw new Error(`${name} is required for a customer launch.`);
}
export const limits = { pages: 10000, projects: 5, crawlsPerMonth: 30 };
