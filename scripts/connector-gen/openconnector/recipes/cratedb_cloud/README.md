# CrateDB Cloud

Read-only international CrateDB Cloud API recipe. Configure the API key (HTTP Basic username) and API secret (password) from CrateDB Cloud account settings. The runner sends `Authorization: Basic` plus `Accept: application/json` to `https://console.cratedb.cloud`.

Selected operations are `healthcheck` (`GET /api/v2/users/me/`, the pinned credential validator), `organizations.list` (`GET /api/v2/organizations/`), `projects.list` (`GET /api/v2/projects/`), `clusters.list` (`GET /api/v2/clusters/` with optional `project_id`), and `regions.list` (`GET /api/v2/regions/`). Organization-scoped computed paths, products, and writes are omitted. Native keeps the pinned trailing slashes; official docs examples sometimes omit them.

Adaptations versus the pinned OpenConnector source: organization-scoped list paths are omitted because they rewrite the request path from a caller-supplied id; list/get responses keep raw JSON under `data` instead of normalized `{user}`/`{organizations}` wrappers; native category is `dev-tools` (source Data/Developer Tools are not both in native CATEGORIES); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://cratedb.com/docs/cloud/en/latest/organization/api.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure key + secret, call `healthcheck` with `{}`, then `organizations.list` with `{}`.
