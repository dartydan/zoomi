export const applicationSchema = `
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL,verification_token TEXT NOT NULL,verified_at TEXT,created_at TEXT NOT NULL,UNIQUE(owner_id,url));
CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,status TEXT NOT NULL,page_limit INTEGER NOT NULL,pages_done INTEGER NOT NULL DEFAULT 0,discovered INTEGER NOT NULL DEFAULT 0,checkpoint TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_token TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease_until BIGINT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS workflow_id TEXT;
CREATE INDEX IF NOT EXISTS jobs_owner_status ON jobs(owner_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_job ON jobs(project_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS audits(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audits_owner ON audits(owner_id,project_id,created_at);
CREATE TABLE IF NOT EXISTS connections(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,tokens TEXT NOT NULL,gsc_site TEXT,ga_property TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY,owner_id TEXT NOT NULL,session_id TEXT NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,verifier TEXT NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS metrics(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,owner_id TEXT NOT NULL,data TEXT NOT NULL,synced_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS billing(owner_id TEXT PRIMARY KEY,customer_id TEXT UNIQUE,subscription_id TEXT,status TEXT NOT NULL DEFAULT 'inactive',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY,processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_owner_job ON jobs(owner_id) WHERE status IN ('queued','running');
CREATE TABLE IF NOT EXISTS api_limits(key TEXT PRIMARY KEY,bucket BIGINT NOT NULL,count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS provider_calls(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL);
`;
