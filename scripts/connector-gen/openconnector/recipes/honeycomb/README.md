# Honeycomb

Read-only international **Honeycomb Configuration API** recipe pinned to the documented US host `api.honeycomb.io`. Create a Configuration API key from Environment Settings > API Keys. Store it as `apiKey`. The runner sends `X-Honeycomb-Team` and `Accept: application/json` to `https://api.honeycomb.io`.

## Operations

- `healthcheck`: `GET /1/auth` with empty input (cheap authenticated key metadata; pinned credential validator).
- `datasets.list`: `GET /1/datasets`.
- `datasets.get`: `GET /1/datasets/{datasetSlug}`; `datasetSlug` is a required non-empty string.
- `boards.list`: `GET /1/boards`.
- `boards.get`: `GET /1/boards/{boardId}`; `boardId` is a required non-empty string.

Successful responses are raw provider JSON under AppCall `data`. Marker create, queries, and ingest are omitted.

## Adaptations

Official docs use `X-Honeycomb-Team` on `https://api.honeycomb.io` and `https://api.eu1.honeycomb.io`. EU is not expressed: the two discrete hostnames cannot be represented by a bounded wildcard plus required stored id. The native template pins the US host. Native category is `dev-tools` (source Data is not in native CATEGORIES). The upstream user-agent is not sent. Responses keep raw Honeycomb JSON under `data` instead of the source authorization/dataset/board unwrap.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.honeycomb.io/api/authentication and https://docs.honeycomb.io/api/auth/list-authorizations. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
