-- OXIDE-POLL-2: seen-item retention. last_seen_at is the last poll that
-- observed the item (refreshed at most hourly per item). A commit never
-- prunes an item it observed, so items still on the polled pages are never
-- forgotten or re-emitted. Items no longer observed are pruned after a TTL
-- and beyond a per-subscription cap; any prune takes a fresh subscription
-- epoch (a pruned item that reappears is a new item under a new key).
ALTER TABLE poll_seen_items
    ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX poll_seen_items_last_seen
    ON poll_seen_items (project_id, connection_id, operation, last_seen_at);
