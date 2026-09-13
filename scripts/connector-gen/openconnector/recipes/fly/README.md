# Fly.io

Read-only international Fly.io Machines API recipe for the pinned OpenConnector `fly` provider (Fly.io machines/orgs, not fly.com). Configure a Fly.io API token from `fly tokens create` or the dashboard. The runner sends `Authorization: Bearer` to `https://api.machines.dev/v1`.

Covered operations: credential-only `healthcheck` (`GET /tokens/current`), `apps.list`, `apps.get`, `machines.list`, and `machines.get`. Machine create/start/stop/restart/wait and volume writes are omitted.

`apps.list` requires `org_slug` (`personal` or an organization slug). docs.machines.dev prose mentions `Authorization: FlyV1`; official fly.io docs and the documented curl samples use Bearer, matching this recipe.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the token, call `healthcheck` with `{}`, then `apps.list` with `org_slug`.
