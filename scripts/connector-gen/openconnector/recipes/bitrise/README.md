# Bitrise

Read-only international **Bitrise API v0.1** recipe for `api.bitrise.io`. Create a personal access token or workspace API token in Bitrise Account settings → Security and store it as `apiKey`. Requests send the raw token in `Authorization` (no Bearer prefix) plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v0.1/me` (cheap authenticated profile read; same path as the pinned credential validator).
- `apps.list`: `GET /v0.1/apps` with optional `sortBy`, `next`, `limit`, `title`, and `projectType`.
- `builds.list`: `GET /v0.1/apps/{appSlug}/builds` with required `appSlug` and optional filters/pagination.
- `builds.get`: `GET /v0.1/apps/{appSlug}/builds/{buildSlug}`; `appSlug` and `buildSlug` are required.

`POST /v0.1/apps/{app-slug}/builds` (trigger) is omitted as a write. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.bitrise.io/v0.1` and a raw `Authorization` token. Native category is `dev-tools`. Native omits the upstream user-agent. Profile fetch is not a named upstream action; healthcheck reuses `list_apps` as the mapping sibling.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API token, call `healthcheck` with `{}`, then `apps.list`. Historical Log4j 2021 coverage is recorded under the 2026-09-13 waiver.
