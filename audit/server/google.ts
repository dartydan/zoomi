import {
  OAuth2Client,
  CodeChallengeMethod,
  type Credentials,
} from "google-auth-library";
import { randomBytes, randomUUID } from "node:crypto";
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
  revision: string;
}
export async function connection(owner: string, project: string) {
  return (await db
    .prepare("SELECT * FROM connections WHERE owner_id=? AND project_id=?")
    .get(owner, project)) as Connection | undefined;
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
  await db
    .prepare("DELETE FROM oauth_states WHERE expires_at<?")
    .run(Date.now());
  await db
    .prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?,?)")
    .run(
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
  const row = (await db
    .prepare(
      "DELETE FROM oauth_states WHERE state_hash=? AND owner_id=? AND session_id=? AND expires_at>? RETURNING *",
    )
    .get(hash(state), owner, session, Date.now())) as
    { project_id: string; verifier: string } | undefined;
  if (!row)
    throw new Error(
      "This connection request expired. Start again from your website’s Connections page.",
    );
  const oauth = client();
  const { tokens } = await oauth.getToken({
    code,
    codeVerifier: unseal<string>(row.verifier),
  });
  if (!tokens.refresh_token)
    throw new Error(
      "Google did not grant ongoing access. Reconnect and allow access to the selected services.",
    );
  await db.transaction(async () => {
    await db
      .prepare(
        "INSERT INTO connections(project_id,owner_id,tokens,updated_at,revision) VALUES(?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET tokens=excluded.tokens,gsc_site=NULL,ga_property=NULL,updated_at=excluded.updated_at,revision=excluded.revision",
      )
      .run(
        row.project_id,
        owner,
        seal(tokens),
        new Date().toISOString(),
        randomUUID(),
      );
    await db
      .prepare("DELETE FROM metrics WHERE project_id=? AND owner_id=?")
      .run(row.project_id, owner);
  }, `connection:${row.project_id}`)();
  return row.project_id;
}
export async function googleClient(owner: string, project: string) {
  const row = await connection(owner, project);
  if (!row) throw new Error("Connect your Google account first.");
  const oauth = client();
  const credentials = unseal<Credentials>(row.tokens);
  oauth.setCredentials(credentials);
  // Persist refreshed credentials before returning any provider response; serverless
  // instances may stop as soon as their HTTP response finishes.
  const request = oauth.request.bind(oauth);
  oauth.request = (async (...args: any[]) => {
    try {
      return await (request as Function)(...args);
    } finally {
      if (
        oauth.credentials.access_token !== credentials.access_token ||
        oauth.credentials.refresh_token !== credentials.refresh_token
      ) {
        await db
          .prepare(
            "UPDATE connections SET tokens=?,updated_at=? WHERE project_id=? AND owner_id=? AND tokens=?",
          )
          .run(
            seal({
              ...oauth.credentials,
              refresh_token:
                oauth.credentials.refresh_token ?? credentials.refresh_token,
            }),
            new Date().toISOString(),
            project,
            owner,
            row.tokens,
          );
      }
    }
  }) as typeof oauth.request;
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
  const oauth = await googleClient(owner, p.id);
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
  const original = await connection(owner, p.id);
  if (!original) throw new Error("Connect your Google account first.");
  const available = await properties(owner, p);
  const oauth = await googleClient(owner, p.id);
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
  await db.transaction(async () => {
    const changed = await db
      .prepare(
        "UPDATE connections SET gsc_site=?,ga_property=?,updated_at=?,revision=? WHERE project_id=? AND owner_id=? AND revision=?",
      )
      .run(
        gsc ?? null,
        ga ?? null,
        new Date().toISOString(),
        randomUUID(),
        p.id,
        owner,
        original.revision,
      );
    if (!changed.changes)
      throw new Error(
        "Your Google connection changed. Reload Connections and choose your properties again.",
      );
    await db
      .prepare("DELETE FROM metrics WHERE project_id=? AND owner_id=?")
      .run(p.id, owner);
    if (
      gsc &&
      available.searchConsole.some(
        (s) =>
          s.siteUrl === gsc &&
          ["siteOwner", "siteFullUser"].includes(s.permissionLevel),
      )
    ) {
      await db
        .prepare("UPDATE projects SET verified_at=? WHERE id=? AND owner_id=?")
        .run(new Date().toISOString(), p.id, owner);
    }
  }, `connection:${p.id}`)();
}
export async function syncMetrics(
  owner: string,
  p: ProjectRow,
  requester?: Pick<OAuth2Client, "request">,
) {
  const c = await connection(owner, p.id);
  if (!c?.gsc_site && !c?.ga_property)
    throw new Error("Choose the properties to connect first.");
  const oauth = requester ?? (await googleClient(owner, p.id));
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
  // Serialize the final write with reconnect, rebind and disconnect. The network
  // requests stay outside the transaction; a stale refresh cannot restore data.
  return db.transaction(async () => {
    const current = await connection(owner, p.id);
    if (!current || current.revision !== c.revision)
      throw new Error(
        "This connection changed during the refresh. Choose your properties and try again.",
      );
    const saved = await db
      .prepare(
        `INSERT INTO metrics(project_id,owner_id,data,synced_at) VALUES(?,?,?,?)
      ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,synced_at=excluded.synced_at WHERE metrics.synced_at<excluded.synced_at`,
      )
      .run(p.id, owner, JSON.stringify(result), result.syncedAt);
    if (!saved.changes) {
      const latest = await db
        .prepare("SELECT data FROM metrics WHERE project_id=? AND owner_id=?")
        .get(p.id, owner);
      if (latest) return JSON.parse(latest.data) as Record<string, unknown>;
    }
    return result;
  }, `connection:${p.id}`)();
}
export async function disconnect(
  owner: string,
  project: string,
  revoke?: (credentials: Credentials) => Promise<void>,
) {
  const removed = await db.transaction(async () => {
    const c = await connection(owner, project);
    await db
      .prepare("DELETE FROM connections WHERE project_id=? AND owner_id=?")
      .run(project, owner);
    await db
      .prepare("DELETE FROM metrics WHERE project_id=? AND owner_id=?")
      .run(project, owner);
    return c;
  }, `connection:${project}`)();
  if (removed) {
    try {
      const credentials = unseal<Credentials>(removed.tokens);
      if (revoke) await revoke(credentials);
      else {
        const oauth = client();
        oauth.setCredentials(credentials);
        await oauth.revokeCredentials();
      }
    } catch {
      /* Local removal has already completed, even when Google is unavailable. */
    }
  }
}
