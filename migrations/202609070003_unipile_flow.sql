-- Correlate hosted-auth callbacks without guessing workspace account recency.
-- Only a hash of the callback bearer token is persisted.
CREATE TABLE unipile_hosted_flows (
 id text PRIMARY KEY,
 token_hash text NOT NULL UNIQUE,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 brand_id text NOT NULL,
 providers text[] NOT NULL,
 expires_at timestamptz NOT NULL,
 account_id text,
 completed boolean NOT NULL DEFAULT false
);
CREATE INDEX unipile_hosted_flows_expiry ON unipile_hosted_flows(expires_at);
