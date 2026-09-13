# Capsule CRM

Read-only international Capsule CRM REST API v2 recipe for Zestia Limited (Manchester, UK). Create a personal access token from My Preferences → API Authentication Tokens. The runner sends `Authorization: Bearer` to `https://api.capsulecrm.com/api/v2`. OAuth2 for third-party apps is documented but not required for this PAT edition.

Covered operations: credential-only `healthcheck` (`GET /users/current`), `parties.list`, `opportunities.list`, and `users.list`. Optional `page` and `perPage` (1–100) match official camelCase query names. `embed` arrays and writes are omitted. Native category is `crm` (source Productivity/Marketing).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the personal access token, call `healthcheck` with `{}`, then `parties.list`.
