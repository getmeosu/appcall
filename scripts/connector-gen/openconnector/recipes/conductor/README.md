# Conductor

Read-only Conductor Monitoring Reporting API v2 recipe for the international product at `api.cm.conductor.com`. Account owners copy the Reporting API token from Account → Integration Tokens. The runner sends `Authorization: token <token>` plus `Accept` and `Content-Type: application/json`, which the official docs require on every request.

Covered operations: credential-only `healthcheck` (`GET /v2/entities/websites`), `websites.list`, `segments.list`, `statistics.get`, and `issues.list`. Page lists, per-URL page gets, affected-pages, CMS check, Data Enrichment, and Conductor's separate Data API at `api.conductor.com` are omitted. Native category is `ads` (source Marketing/Data are not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the Reporting API token, call `healthcheck` with `{}`, then `websites.list`.
