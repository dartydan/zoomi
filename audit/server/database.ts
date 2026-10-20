import Database from "better-sqlite3";
import { resolve } from "node:path";
import { dataDir } from "./config.ts";
export const db = new Database(resolve(dataDir, "audit.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL,verification_token TEXT NOT NULL,verified_at TEXT,created_at TEXT NOT NULL,UNIQUE(owner_id,url));
CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,status TEXT NOT NULL,page_limit INTEGER NOT NULL,pages_done INTEGER NOT NULL DEFAULT 0,discovered INTEGER NOT NULL DEFAULT 0,checkpoint TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_owner_status ON jobs(owner_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(project_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS audits(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audits_owner ON audits(owner_id,project_id,created_at);
CREATE TABLE IF NOT EXISTS connections(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,tokens TEXT NOT NULL,gsc_site TEXT,ga_property TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,session_id TEXT NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,verifier TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS metrics(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,data TEXT NOT NULL,synced_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS billing(owner_id TEXT PRIMARY KEY,customer_id TEXT UNIQUE,subscription_id TEXT,status TEXT NOT NULL DEFAULT 'inactive',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY,processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
`);
export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  url: string;
  verification_token: string;
  verified_at: string | null;
  created_at: string;
}
export function ownedProject(
  owner: string,
  id: string,
): ProjectRow | undefined {
  return db
    .prepare("SELECT * FROM projects WHERE id=? AND owner_id=?")
    .get(id, owner) as ProjectRow | undefined;
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
