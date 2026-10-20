import {
  OAuth2Client,
  CodeChallengeMethod,
  type Credentials,
} from "google-auth-library";
import { randomBytes } from "node:crypto";
import { db, type ProjectRow } from "./database.ts";
import { appUrl } from "./config.ts";
import { seal, unseal, hash } from "./crypto.ts";
export const googleReady = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const client = () =>
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/google/callback`,
  );
interface Connection {
  owner_id: string;
  project_id: string;
  tokens: string;
  gsc_site: string | null;
  ga_property: string | null;
  updated_at: string;
}
export function connection(owner: string, project: string) {
  return db
    .prepare("SELECT * FROM connections WHERE owner_id=? AND project_id=?")
    .get(owner, project) as Connection | undefined;
}
export async function authorizationUrl(
  owner: string,
  session: string,
  project: string,
) {
  if (!googleReady())
    throw new Error(
      "Zoomi’s Google connection must be configured before customers can authorize access.",
    );
  const oauth = client();
  const { codeVerifier, codeChallenge } =
    await oauth.generateCodeVerifierAsync();
  const state = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM oauth_states WHERE expires_at<?").run(Date.now());
  db.prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?,?)").run(
    hash(state),
    owner,
    session,
    project,
    seal(codeVerifier),
    Date.now() + 10 * 60 * 1000,
  );
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/analytics.readonly",
    ],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}
export async function completeAuthorization(
  owner: string,
  session: string,
  state: string,
  code: string,
) {
  const row = db
    .prepare(
      "SELECT * FROM oauth_states WHERE state_hash=? AND owner_id=? AND session_id=? AND expires_at>?",
    )
    .get(hash(state), owner, session, Date.now()) as
    | { project_id: string; verifier: string }
    | undefined;
  if (!row)
    throw new Error(
      "This connection request expired. Start again from your website’s Connections page.",
    );
  db.prepare("DELETE FROM oauth_states WHERE state_hash=?").run(hash(state));
  const oauth = client();
  const { tokens } = await oauth.getToken({
    code,
    codeVerifier: unseal<string>(row.verifier),
  });
  if (!tokens.refresh_token)
    throw new Error(
      "Google did not grant ongoing access. Reconnect and allow access to the selected services.",
    );
  db.prepare(
    "INSERT INTO connections(project_id,owner_id,tokens,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET tokens=excluded.tokens,gsc_site=NULL,ga_property=NULL,updated_at=excluded.updated_at",
  ).run(row.project_id, owner, seal(tokens), new Date().toISOString());
  db.prepare("DELETE FROM metrics WHERE project_id=? AND owner_id=?").run(
    row.project_id,
    owner,
  );
  return row.project_id;
}
export function googleClient(owner: string, project: string) {
  const row = connection(owner, project);
  if (!row) throw new Error("Connect your Google account first.");
  const oauth = client();
  const credentials = unseal<Credentials>(row.tokens);
  oauth.setCredentials(credentials);
  oauth.on("tokens", (tokens) => {
    db.prepare(
      "UPDATE connections SET tokens=?,updated_at=? WHERE project_id=? AND owner_id=?",
    ).run(
      seal({
        ...credentials,
        ...tokens,
        refresh_token: tokens.refresh_token ?? credentials.refresh_token,
      }),
      new Date().toISOString(),
      project,
      owner,
    );
  });
  return oauth;
}
const domain = (url: string) => new URL(url).hostname.toLowerCase();
export function matchesSearchProperty(site: string, url: string) {
  try {
    if (site.startsWith("sc-domain:")) {
      const d = site.slice(10).toLowerCase();
      return domain(url) === d || domain(url).endsWith(`.${d}`);
    }
    const base = new URL(site);
    const target = new URL(url);
    return (
      base.origin === target.origin && target.pathname.startsWith(base.pathname)
    );
  } catch {
    return false;
  }
}
export async function properties(owner: string, p: ProjectRow) {
  const oauth = googleClient(owner, p.id);
  const results = await Promise.allSettled([
    oauth.request<{
      siteEntry?: { siteUrl: string; permissionLevel: string }[];
    }>({
      url: "https://www.googleapis.com/webmasters/v3/sites",
      timeout: 15000,
    }),
    oauth.request<{
      accountSummaries?: {
        displayName: string;
        propertySummaries?: { property: string; displayName: string }[];
      }[];
    }>({
      url: "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      timeout: 15000,
    }),
  ]);
  const gsc = results[0];
  const ga = results[1];
  return {
    searchConsole:
      gsc.status === "fulfilled"
        ? (gsc.value.data.siteEntry ?? []).filter(
            (s) =>
              matchesSearchProperty(s.siteUrl, p.url) &&
              s.permissionLevel !== "siteUnverifiedUser",
          )
        : [],
    analytics:
      ga.status === "fulfilled"
        ? (ga.value.data.accountSummaries ?? []).flatMap((a) =>
            (a.propertySummaries ?? []).map((s) => ({
              ...s,
              account: a.displayName,
            })),
          )
        : [],
    errors: [
      gsc.status === "rejected"
        ? "Search Console access is unavailable. Check the permission granted to Audit."
        : null,
      ga.status === "rejected"
        ? "Analytics access is unavailable. Check the permission granted to Audit."
        : null,
    ].filter(Boolean),
  };
}
export async function bindProperties(
  owner: string,
  p: ProjectRow,
  gsc?: string,
  ga?: string,
) {
  const available = await properties(owner, p);
  const oauth = googleClient(owner, p.id);
  if (gsc && !available.searchConsole.some((s) => s.siteUrl === gsc))
    throw new Error(
      "Choose an accessible Search Console property for this website.",
    );
  if (ga) {
    if (
      !/^properties\/\d+$/.test(ga) ||
      !available.analytics.some((a) => a.property === ga)
    )
      throw new Error("Choose an accessible Analytics property.");
    const streams = await oauth.request<{
      dataStreams?: { webStreamData?: { defaultUri?: string } }[];
    }>({
      url: `https://analyticsadmin.googleapis.com/v1beta/${ga}/dataStreams`,
      timeout: 15000,
    });
    if (
      !streams.data.dataStreams?.some((s) => {
        try {
          return domain(s.webStreamData?.defaultUri ?? "") === domain(p.url);
        } catch {
          return false;
        }
      })
    )
      throw new Error(
        "This Analytics property does not have a web stream matching your website address.",
      );
  }
  if (!gsc && !ga) throw new Error("Select at least one property.");
  db.prepare(
    "UPDATE connections SET gsc_site=?,ga_property=?,updated_at=? WHERE project_id=? AND owner_id=?",
  ).run(gsc ?? null, ga ?? null, new Date().toISOString(), p.id, owner);
  if (
    gsc &&
    available.searchConsole.some(
      (s) =>
        s.siteUrl === gsc &&
        ["siteOwner", "siteFullUser"].includes(s.permissionLevel),
    )
  )
    db.prepare(
      "UPDATE projects SET verified_at=? WHERE id=? AND owner_id=?",
    ).run(new Date().toISOString(), p.id, owner);
}
export async function syncMetrics(owner: string, p: ProjectRow) {
  const c = connection(owner, p.id);
  if (!c?.gsc_site && !c?.ga_property)
    throw new Error("Choose the properties to connect first.");
  const oauth = googleClient(owner, p.id);
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const result: Record<string, unknown> = {
    syncedAt: new Date().toISOString(),
    errors: [],
  };
  const errors: string[] = [];
  if (c.gsc_site)
    try {
      const request = {
        startDate: daysAgo(30),
        endDate: daysAgo(3),
        type: "web",
      };
      const [summary, queries, pages] = await Promise.all([
        oauth.request({
          url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.gsc_site)}/searchAnalytics/query`,
          method: "POST",
          data: request,
          timeout: 20000,
        }),
        oauth.request({
          url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.gsc_site)}/searchAnalytics/query`,
          method: "POST",
          data: { ...request, dimensions: ["query"], rowLimit: 100 },
          timeout: 20000,
        }),
        oauth.request({
          url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.gsc_site)}/searchAnalytics/query`,
          method: "POST",
          data: { ...request, dimensions: ["page"], rowLimit: 1000 },
          timeout: 20000,
        }),
      ]);
      result.searchConsole = {
        ...request,
        summary: summary.data,
        queries: queries.data,
        pages: pages.data,
      };
    } catch {
      errors.push(
        "Search Console sync failed. Reconnect if permissions changed.",
      );
    }
  if (c.ga_property)
    try {
      const body = {
        dateRanges: [{ startDate: daysAgo(28), endDate: daysAgo(1) }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "keyEvents" },
        ],
      };
      const [summary, pages] = await Promise.all([
        oauth.request({
          url: `https://analyticsdata.googleapis.com/v1beta/${c.ga_property}:runReport`,
          method: "POST",
          data: body,
          timeout: 20000,
        }),
        oauth.request({
          url: `https://analyticsdata.googleapis.com/v1beta/${c.ga_property}:runReport`,
          method: "POST",
          data: {
            dateRanges: body.dateRanges,
            dimensions: [{ name: "pagePathPlusQueryString" }],
            metrics: [{ name: "screenPageViews" }],
            limit: 1000,
          },
          timeout: 20000,
        }),
      ]);
      result.analytics = {
        dateRanges: body.dateRanges,
        summary: summary.data,
        pages: pages.data,
      };
    } catch {
      errors.push("Analytics sync failed. Reconnect if permissions changed.");
    }
  result.errors = errors;
  if (!result.searchConsole && !result.analytics)
    throw new Error(errors.join(" "));
  db.prepare(
    "INSERT INTO metrics VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,synced_at=excluded.synced_at",
  ).run(p.id, owner, JSON.stringify(result), new Date().toISOString());
  return result;
}
export async function disconnect(owner: string, project: string) {
  const c = connection(owner, project);
  if (c) {
    const oauth = googleClient(owner, project);
    try {
      await oauth.revokeCredentials();
    } catch {
      /* Local removal always completes, even if the grant is already revoked. */
    }
    db.transaction(() => {
      db.prepare(
        "DELETE FROM connections WHERE project_id=? AND owner_id=?",
      ).run(project, owner);
      db.prepare("DELETE FROM metrics WHERE project_id=? AND owner_id=?").run(
        project,
        owner,
      );
    })();
  }
}
