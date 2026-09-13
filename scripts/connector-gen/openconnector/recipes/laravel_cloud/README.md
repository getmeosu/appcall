# Laravel Cloud

Read-only international **Laravel Cloud API** recipe. Create an API token from organization settings and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://cloud.laravel.com/api`.

## Operations

- `healthcheck`: `GET /meta/organization` with empty input (cheap authenticated read; pinned credential validator).
- `regions.list`: `GET /meta/regions` with empty input.
- `applications.list`: `GET /applications` with optional `name`, `region`, and `slug` (sent as `filter[name]`, `filter[region]`, `filter[slug]`).
- `applications.get`: `GET /applications/{applicationId}` with required `applicationId`.
- `environments.list`: `GET /applications/{applicationId}/environments` with required `applicationId` and optional `name`, `status`, and `slug` filters.

Successful responses are raw provider JSON under AppCall `data`. Writes and JSON:API `include` relationship arrays are omitted.

## Adaptations

Native category is `dev-tools` (source Developer Tools/Storage are not in the Rust CATEGORIES allowlist). Official `include` query arrays are omitted because the native template cannot join arrays. Pagination next links are never followed.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
