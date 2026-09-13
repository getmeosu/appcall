# PlanetScale

Read-only international PlanetScale API v1 recipe. Configure a service token and its service token ID from Organization Settings. The runner sends `Authorization: {serviceTokenId}:{apiKey}` (no Bearer scheme) to `https://api.planetscale.com/v1`.

Covered operations: credential-only `healthcheck` (`GET /organizations`), `organizations.list`, `databases.list`, `databases.get`, and `branches.list`. Pagination uses `page` and `per_page` (input `perPage`, max 100). Database and branch create/delete are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://planetscale.com/docs/api/service-tokens and https://planetscale.com/docs/api/reference/list_organizations. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure both setup fields, call `healthcheck` with `{}`, then `organizations.list`.
