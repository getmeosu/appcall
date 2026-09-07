ALTER TABLE webhook_events ADD COLUMN external_account_id text NOT NULL DEFAULT '';
ALTER TABLE webhook_events ADD COLUMN stream_position bigserial;
CREATE UNIQUE INDEX webhook_events_stream_position ON webhook_events(stream_position);
CREATE INDEX webhook_events_project_stream ON webhook_events(project_id,stream_position);
CREATE TABLE webhook_outbox (
 project_id text NOT NULL,
 event_id text NOT NULL,
 dispatched_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
 PRIMARY KEY(project_id,event_id),
 FOREIGN KEY(project_id,event_id) REFERENCES webhook_events(project_id,id) ON DELETE CASCADE
);
CREATE INDEX webhook_outbox_pending ON webhook_outbox(next_attempt_at) WHERE dispatched_at IS NULL;
ALTER TABLE usage_events ADD COLUMN quantity bigint NOT NULL DEFAULT 1 CHECK(quantity > 0);
ALTER TABLE usage_events ADD COLUMN metering_event_key text;
CREATE UNIQUE INDEX usage_events_metering_identity ON usage_events(project_id,metering_event_key);
