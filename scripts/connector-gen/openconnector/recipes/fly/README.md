# Fly.io

Fly.io Machines API plus GraphQL API recipe for the pinned OpenConnector `fly` provider (Fly.io machines/orgs, not fly.com). Configure a Fly.io API token from `fly tokens create` or the dashboard. The runner sends `Authorization: Bearer` to `https://api.machines.dev/v1` for Machines REST operations and to `https://api.fly.io/graphql` for GraphQL operations.

Covered operations: credential-only `healthcheck` (`GET /tokens/current`) plus the origin Machines reads (`apps.list`, `apps.get`, `machines.list`, `machines.get`) and the 45 Composio FLY tools (WireGuard, health checks, add-ons, GraphQL apps/machines, organizations, SSH, certificates, platform, and config validation). GraphQL HTTP 200 bodies with a non-empty `errors` array fail via `bodyErrorPaths`. Native returns raw Fly JSON under `data`.

`apps.list` requires `org_slug` (`personal` or an organization slug) and maps to `FLY_LIST_APPS`. `FLY_GET_APP_DETAILS` is GraphQL `apps.details`; `FLY_GET_MACHINE` / `FLY_LIST_MACHINES` are GraphQL (`machines.get_by_id`, `machines.list_graphql`) and sit beside the origin per-app Machines REST ops. `FLY_CHECK_JOBS` posts a caller-supplied GraphQL document. `FLY_FETCH_NODES_BY_IDS` sends `id` and `__typename` (optional `query_fields` is not interpolated). `FLY_GET_VIEWER_INFO` and `FLY_LIST_ADD_ONS` send default GraphQL selections.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). GraphQL schema: https://github.com/superfly/fly-go/blob/master/schema.graphql. Machines OpenAPI: https://docs.machines.dev/openapi.json. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
