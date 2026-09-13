# Codemagic

Read-only international **Codemagic REST API v3** recipe for `codemagic.io`. Create a personal API token under Teams > Personal Account > Integrations > Codemagic API and store it as `apiKey`. Requests send `x-auth-token` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /api/v3/user` (cheap authenticated profile read; same path as the pinned credential validator).
- `teams.list`: `GET /api/v3/user/teams` with optional `page` and `page_size`.
- `apps.list`: `GET /api/v3/user/apps` with optional `page` and `page_size`.
- `team-apps.list`: `GET /api/v3/teams/{team_id}/apps`; `team_id` is required.
- `builds.get`: `GET /api/v3/builds/{build_id}`; `build_id` is required.

Legacy `POST https://api.codemagic.io/builds` start/cancel is omitted as a write. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned v3 reads use `https://codemagic.io` (not `api.codemagic.io`). Native category is `dev-tools`. Native omits the upstream user-agent. Array `id` filters on team apps are omitted because native query templates JSON-stringify arrays.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API token, call `healthcheck` with `{}`, then `teams.list`. Historical December 2022 GCS listing is recorded under the 2026-09-13 waiver.
