import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { db } from "./database.ts";
import { appUrl, authSecret, production } from "./config.ts";
async function sendEmail(to: string, subject: string, url: string) {
  if (!process.env.RESEND_API_KEY)
    throw new Error("Account email delivery is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      text: `${subject}\n\nOpen this link to continue:\n${url}\n\nIf you did not request this, you can ignore this message.`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Account email could not be delivered.");
}
export const auth = betterAuth({
  appName: "Audit by Zoomi",
  baseURL: appUrl,
  secret: authSecret,
  database: db,
  trustedOrigins: [appUrl],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    requireEmailVerification: production,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      sendEmail(user.email, "Reset your Audit password", url),
  },
  emailVerification: {
    sendOnSignUp: production,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) =>
      sendEmail(user.email, "Verify your Audit email", url),
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: production,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
    },
  },
});
export async function migrateAuth() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
