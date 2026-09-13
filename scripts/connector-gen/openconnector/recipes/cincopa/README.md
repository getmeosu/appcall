# Cincopa

Read-only international **Cincopa API v2** recipe for `api.cincopa.com`. Create an API token in the Cincopa manager (API Tokens) and store it as `apiKey`. Requests send `api_token` as a query parameter plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /v2/ping.json` (cheap authenticated ping; same path as the pinned credential validator).
- `galleries.list`: `GET /v2/gallery.list.json` with optional `search`, `page`, and `itemsPerPage`.
- `gallery.items.list`: `GET /v2/gallery.get_items.json` with required `fid` and optional pagination.
- `assets.list`: `GET /v2/asset.list.json` with optional `search`, `rid`, `referenceId`, `tag`, and pagination.

Gallery create/remove and asset mutation writes are omitted. Array filters that the source comma-joins (`filterTags`, `types`, `details`) are omitted because native templates cannot express that encoding. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://api.cincopa.com/v2/` and `api_token` query auth. Native category is `utility` (source Design & Media / Storage; those buckets are not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Official v2 documents HTTP 403 for an invalid token and `success: true` on HTTP 200, so `bodyErrorPaths` is not set.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.cincopa.com/apis. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API token, call `healthcheck` with `{}`, then `galleries.list`.
