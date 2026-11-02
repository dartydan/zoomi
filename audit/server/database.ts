import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";
import {
  Kysely,
  PostgresDialect,
  CompiledQuery,
  type Dialect,
  type DatabaseConnection,
} from "kysely";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { dataDir, production } from "./config.ts";
import { applicationSchema } from "./schema.ts";

const remote = !!process.env.DATABASE_URL;
async function createDatabase() {
  let dialect: Dialect;
  if (remote) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    dialect = new PostgresDialect({ pool });
  } else {
    if (production || process.env.VERCEL)
      throw new Error(
        "DATABASE_URL must point to Audit’s persistent PostgreSQL database.",
      );
    const { KyselyPGlite } = await import("kysely-pglite");
    const local = await KyselyPGlite.create(resolve(dataDir, "postgres"));
    // PGlite has one database connection. Hold it for an entire transaction.
    let pending = Promise.resolve();
    const makeDriver = local.dialect.createDriver;
    dialect = {
      ...local.dialect,
      createDriver() {
        const driver = makeDriver();
        const releases = new WeakMap<DatabaseConnection, () => void>();
        return {
          ...driver,
          init: () => driver.init(),
          destroy: () => driver.destroy(),
          async acquireConnection() {
            let release!: () => void;
            const previous = pending;
            pending = new Promise<void>((r) => (release = r));
            await previous;
            try {
              const connection = await driver.acquireConnection();
              releases.set(connection, release);
              return connection;
            } catch (error) {
              release();
              throw error;
            }
          },
          async releaseConnection(connection) {
            try {
              await driver.releaseConnection(connection);
            } finally {
              releases.get(connection)?.();
            }
          },
          beginTransaction: (c, s) => driver.beginTransaction(c, s),
          commitTransaction: (c) => driver.commitTransaction(c),
          rollbackTransaction: (c) => driver.rollbackTransaction(c),
        };
      },
    };
  }
  return new Kysely<any>({ dialect });
}
const globals = globalThis as typeof globalThis & {
  auditLocalDatabase?: { path: string; value: Promise<Kysely<any>> };
};
if (!remote && !globals.auditLocalDatabase)
  globals.auditLocalDatabase = { path: dataDir, value: createDatabase() };
export const sqlDb = await (remote
  ? createDatabase()
  : globals.auditLocalDatabase!.value);
const context = new AsyncLocalStorage<Kysely<any>>();
function statement(sql: string, args: unknown[]) {
  const values: unknown[] = [];
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    !Array.isArray(args[0])
  ) {
    const named = args[0] as Record<string, unknown>;
    sql = sql.replace(/@([a-z_][a-z_0-9]*)/gi, (_, key) => {
      values.push(named[key]);
      return "$" + values.length;
    });
  } else {
    let index = 0;
    sql = sql.replace(/\?/g, () => "$" + ++index);
    values.push(...args);
  }
  return CompiledQuery.raw(sql, values);
}
export const db = {
  prepare(sql: string) {
    return {
      async all(...args: unknown[]): Promise<any[]> {
        return (
          await (context.getStore() ?? sqlDb).executeQuery(statement(sql, args))
        ).rows;
      },
      async get(...args: unknown[]): Promise<any> {
        return (await this.all(...args))[0];
      },
      async run(...args: unknown[]) {
        const result = await (context.getStore() ?? sqlDb).executeQuery(
          statement(sql, args),
        );
        return {
          changes: Number(
            result.numAffectedRows ??
              (result as unknown as { affectedRows?: number }).affectedRows ??
              0,
          ),
        };
      },
    };
  },
  async exec(sql: string) {
    for (const query of sql.split(";").filter((q) => q.trim()))
      await (context.getStore() ?? sqlDb).executeQuery(
        CompiledQuery.raw(query),
      );
  },
  transaction<T>(fn: () => Promise<T>, key = "audit:write") {
    return async () => {
      if (context.getStore()) return fn();
      return sqlDb.transaction().execute(async (trx) =>
        context.run(trx, async () => {
          if (remote)
            await trx.executeQuery(
              CompiledQuery.raw(
                "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
                [key],
              ),
            );
          return fn();
        }),
      );
    };
  },
  async close() {
    await sqlDb.destroy();
  },
};
export async function migrateDatabase() {
  await db.transaction(async () => {
    await db.exec(applicationSchema);
  }, "audit:migrations")();
}
if (!production) await migrateDatabase();

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  url: string;
  verification_token: string;
  verified_at: string | null;
  created_at: string;
}
export async function ownedProject(
  owner: string,
  id: string,
): Promise<ProjectRow | undefined> {
  return (await db
    .prepare("SELECT * FROM projects WHERE id=? AND owner_id=?")
    .get(id, owner)) as ProjectRow | undefined;
}
export function projectView(p: ProjectRow) {
  return {
    id: p.id,
    name: p.name,
    url: p.url,
    verifiedAt: p.verified_at,
    verificationToken: p.verification_token,
    createdAt: p.created_at,
  };
}
