# Builder.io

Read-only international **Builder.io Content API v3** recipe. Configure the **public API key** from Space Settings. Requests send `apiKey` as a query parameter to `https://cdn.builder.io`. Official Content API docs require `apiKey` (not `apikey`).

Covered operations: credential-only `healthcheck` (`GET /api/v3/content/page?limit=1`, the official example model), `content.list`, and `content.get`. Write API create/update/delete, MongoDB-style query objects, and dual-host Write API (`builder.io`) are omitted.

Native category is `dev-tools` (source Design & Media / Marketing are not in the Rust CATEGORIES allowlist). Pinned source sends `Authorization: Bearer` with a private key on Content API reads; native follows official query-only public-key auth.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the public API key, call `healthcheck` with `{}`, then `content.list` with a model name.
