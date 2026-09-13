# Fellow

Read-only international Fellow Developer API recipe. An admin enables the API in Workspace settings → Security. Generate a user API key under User settings → Developer tools. Store the key as `apiKey` plus the workspace subdomain as `subdomain` (the `{slug}` in `{slug}.fellow.app`). The runner sends `X-API-KEY` to `https://<subdomain>.fellow.app`.

Covered operations: credential-only `healthcheck` (`GET /api/v1/me`), `notes.list` (`POST /api/v1/notes` with `{}`), `notes.get`, and `action-items.get`. Complete/archive writes, list filters, recordings, and webhooks are omitted. Provider next cursors are never followed.

Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.fellow.ai/reference/authentication-1. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key and subdomain, call `healthcheck` with `{}`, then `notes.list`.
