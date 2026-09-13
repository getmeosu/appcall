# Carbone

Read-only international Carbone Cloud HTTP API v5 recipe for CarboneIO SAS (Bellevigny, France). Copy the production or test API key from the Carbone account home page. The runner sends `Authorization: Bearer` and `carbone-version: 5` to `https://api.carbone.io`. Official Cloud defaults to version 4 when the header is omitted; this recipe pins 5 to match the pinned source default. On-premise editions with authentication disabled are not this recipe.

Covered operations: credential-only `healthcheck` (`GET /templates/categories`; official `GET /status` is unauthenticated and is not used), `templates.list`, and `templates.tags.list`. Optional `category`, `search`, `includeVersions`, `cursor`, and `limit` (1–100) match official camelCase query names. Template upload/render/delete are omitted (multipart and writes). Native categories are `productivity` and `dev-tools`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `templates.list`.
