# Raindrop.io

Read-only international **Raindrop.io REST API v1** recipe. Raindrop.io is a global bookmark manager operated by Rustem Mussabekov.

## Setup

Register an integration at https://app.raindrop.io/settings/integrations and copy the **Test token** (own-account) or an OAuth access token. Store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.raindrop.io/rest/v1`.

## Operations

- `healthcheck`: `GET /user` with empty input (cheap authenticated profile probe; pinned credential validator).
- `collections.list`: `GET /collections` (root collections only).
- `collections.get`: `GET /collection/{collectionId}`; `collectionId` is a required integer.
- `raindrops.list`: `GET /raindrops/{collectionId}` with required `collectionId` (`0` = all except Trash) and optional `search`, `sort`, `page`, `perPage` (wire name `perpage`, 1–50), and `nested`.
- `tags.list`: `GET /tags` across all collections.

Successful responses are raw provider JSON under AppCall `data`. Writes, nested-collection fan-out (`includeChildren` → `/collections/childrens`), and collection-scoped tag paths are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.raindrop.io/rest/v1` and Bearer auth. Native GET requests omit the source executor's always-on `Content-Type`. Native category is `productivity`. Healthcheck uses GET `/user` rather than a billable search.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
