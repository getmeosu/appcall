-- Append-only observations of the sync job lifecycle.
--
-- This migration deliberately does not backfill existing jobs.  Rows written
-- before this table existed have an unknown history boundary.
CREATE TABLE sync_job_events (
    job_id text NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
    seq integer NOT NULL CHECK (seq > 0),
    kind text NOT NULL CHECK (kind IN (
        'scheduled', 'claimed', 'page', 'retry',
        'lease_expired', 'succeeded', 'failed', 'cancelled'
    )),
    at timestamptz NOT NULL DEFAULT clock_timestamp(),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (
            jsonb_typeof(detail) = 'object'
            AND octet_length(detail::text) <= 1024
            AND detail - 'reason' - 'recordsWritten' - 'hasMore'
                - 'retryDelayMs' - 'code' - 'policy' = '{}'::jsonb
            AND (
                NOT detail ? 'reason'
                OR (
                    jsonb_typeof(detail->'reason') = 'string'
                    AND octet_length(detail->>'reason') <= 96
                )
            )
            AND (
                NOT detail ? 'code'
                OR (
                    jsonb_typeof(detail->'code') = 'string'
                    AND octet_length(detail->>'code') <= 96
                )
            )
            AND (
                NOT detail ? 'recordsWritten'
                OR (
                    jsonb_typeof(detail->'recordsWritten') = 'number'
                    AND (detail->>'recordsWritten') ~ '^[0-9]+$'
                    AND CASE
                        WHEN (detail->>'recordsWritten') ~ '^[0-9]+$'
                        THEN (detail->>'recordsWritten')::integer BETWEEN 0 AND 10000
                        ELSE false
                    END
                )
            )
            AND (
                NOT detail ? 'hasMore'
                OR jsonb_typeof(detail->'hasMore') = 'boolean'
            )
            AND (
                NOT detail ? 'retryDelayMs'
                OR (
                    jsonb_typeof(detail->'retryDelayMs') = 'number'
                    AND (detail->>'retryDelayMs') ~ '^[0-9]+$'
                    AND CASE
                        WHEN (detail->>'retryDelayMs') ~ '^[0-9]+$'
                        THEN (detail->>'retryDelayMs')::integer BETWEEN 0 AND 86400000
                        ELSE false
                    END
                )
            )
            AND (
                NOT detail ? 'policy'
                OR (
                    jsonb_typeof(detail->'policy') = 'object'
                    AND (detail->'policy') ?& ARRAY[
                        'source', 'maxAttempts', 'leaseDurationMs',
                        'retryBaseMs', 'maxRetryDelayMs'
                    ]
                    AND ((detail->'policy') - 'source' - 'maxAttempts'
                        - 'leaseDurationMs' - 'retryBaseMs' - 'maxRetryDelayMs' = '{}'::jsonb)
                    AND jsonb_typeof(detail->'policy'->'maxAttempts') = 'number'
                    AND (detail->'policy'->>'maxAttempts') ~ '^[0-9]+$'
                    AND CASE
                        WHEN (detail->'policy'->>'maxAttempts') ~ '^[0-9]+$'
                        THEN (detail->'policy'->>'maxAttempts')::bigint BETWEEN 1 AND 4294967295
                        ELSE false
                    END
                    AND jsonb_typeof(detail->'policy'->'leaseDurationMs') = 'number'
                    AND (detail->'policy'->>'leaseDurationMs') ~ '^[0-9]+$'
                    AND CASE
                        WHEN (detail->'policy'->>'leaseDurationMs') ~ '^[0-9]+$'
                        THEN (detail->'policy'->>'leaseDurationMs')::bigint BETWEEN 0 AND 3600000
                        ELSE false
                    END
                    AND jsonb_typeof(detail->'policy'->'retryBaseMs') = 'string'
                    AND (detail->'policy'->>'retryBaseMs') ~ '^[0-9]+$'
                    AND octet_length(detail->'policy'->>'retryBaseMs') <= 128
                    AND jsonb_typeof(detail->'policy'->'maxRetryDelayMs') = 'number'
                    AND (detail->'policy'->>'maxRetryDelayMs') ~ '^[0-9]+$'
                    AND CASE
                        WHEN (detail->'policy'->>'maxRetryDelayMs') ~ '^[0-9]+$'
                        THEN (detail->'policy'->>'maxRetryDelayMs')::bigint BETWEEN 0 AND 86400000
                        ELSE false
                    END
                    AND COALESCE(detail->'policy'->>'source', '') = 'service_config'
                )
            )
        ),
    PRIMARY KEY (job_id, seq),
    CHECK (
        kind <> 'scheduled'
        OR COALESCE(detail->>'reason', '') IN ('new_job', 'run_now', 'reset_attempts')
    ),
    CHECK (
        kind <> 'cancelled'
        OR COALESCE(detail->>'reason', '') = 'operator_cancelled'
    ),
    CHECK (
        kind <> 'page'
        OR (detail ? 'recordsWritten' AND detail ? 'hasMore')
    ),
    CHECK (
        kind <> 'retry'
        OR detail ? 'retryDelayMs'
    ),
    CHECK (
        kind = 'claimed'
        OR NOT detail ? 'policy'
    ),
    CHECK (
        kind <> 'failed'
        OR COALESCE(detail->>'code', '') <> ''
    )
);
