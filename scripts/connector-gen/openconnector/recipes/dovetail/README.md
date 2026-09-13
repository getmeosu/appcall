# Dovetail

Read-only international Dovetail Public API recipe at `https://dovetail.com/api`. Generate a personal API key in Settings → Account → Personal API keys. The runner sends `Authorization: Bearer`. Alternate `dovetailapp.com` host is not admitted.

Covered operations: credential-only `healthcheck` (`GET /v1/token/info`), `projects.list` with optional `limit` (`page[limit]` 0–100), `data.list` with optional `projectId` (`filter[project_id]`), and `data.get`. Writes, export, search, and cursor pagination are omitted. Provider next cursors are never followed.

Native category is `productivity` (source Data is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.dovetail.com/docs/authorization. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `projects.list`.
