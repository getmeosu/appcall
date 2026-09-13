# AgentQL

Read-only international AgentQL REST API v1 recipe for Tiny Fish Inc. (Palo Alto). Configure an API key from the AgentQL developer portal. The runner sends `X-API-Key` to `https://api.agentql.com`.

Covered operations: credential-only `healthcheck` and `usage.get` (`GET /v1/usage`), `sessions.usage.list` (`GET /v1/tetra/usage`), and billed `query.data` (`POST /v1/query-data`). Remote browser session create and multipart document query are omitted. Do not use `query.data` as a healthcheck; it consumes API credits.

Native category is `dev-tools` (source AI/Developer Tools/Data). Native `query.data` requires `query` and `url`; prompt/html alternatives and nested params are omitted. POST sends `X-TF-Request-Origin: rest-api-data` matching the pinned source and OpenAPI default. The upstream user-agent is not sent. Responses keep raw AgentQL JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.agentql.com/rest-api/api-reference and https://api.agentql.com/openapi.json. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `usage.get`.
