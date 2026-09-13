# CodeRabbit

Read-only international CodeRabbit REST API recipe. Configure a dashboard API key (`cr-…`). The runner sends `x-coderabbitai-api-key` to `api.coderabbit.ai`. This is the official REST API, not the older on-demand report generator.

Covered operations: credential-only `healthcheck` (`GET /v1/users`), `users.list`, `roles.list`, `roles.get`, and `auditLogs.list`. Seat/role writes, review-metrics date-range queries, and custom-role mutation are omitted. `auditLogs.list` is documented as Enterprise/Admin.

Workspace-only `org_id`/`linked` user filters and audit-log array filters are omitted because the native query template cannot express them exactly as the pinned source does.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `users.list`.
