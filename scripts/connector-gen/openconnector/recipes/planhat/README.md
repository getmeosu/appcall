# Planhat

Read-only international Planhat API recipe pinned to `api.planhat.com`. Configure an API access token from Settings > Private Apps (service accounts). The runner sends `Authorization: Bearer` to `https://api.planhat.com`.

Covered operations: credential-only `healthcheck` (`GET /companies?limit=1`), `companies.list`, `companies.get`, `endusers.list`, and `endusers.get`. Offset pagination is caller-controlled. Company and enduser writes are not exposed.

Cluster-specific hosts (`api-eu.planhat.com`, `api-eu2.planhat.com`, `api-us2.planhat.com`, and similar) are not expressed: the pinned source hardcodes `api.planhat.com`, which a bounded wildcard plus required stored id cannot represent as an enum mapping. Analytics (`analytics.planhat.com`) is out of scope.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://www.planhat.com/developers/api/authentication-limits and https://www.planhat.com/developers/api/company. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API access token, call `healthcheck` with `{}`, then `companies.list`.
