# RAWG

Read-only international RAWG Video Games Database API recipe. Create an API key at https://rawg.io/apidocs and store it as `apiKey`. The runner sends it as the documented `key` query parameter to `https://api.rawg.io/api` with `Accept: application/json`.

## Operations

- `healthcheck`: `GET /platforms?page_size=1` (cheap authenticated read; matches pinned credential validation).
- `platforms.list`: `GET /platforms` with optional `page`, `pageSize` (1–40 → `page_size`), and `ordering`.
- `genres.list`: `GET /genres` with optional `page`, `pageSize`, and `ordering`.
- `games.list`: `GET /games` with optional `search`, `page`, and `pageSize`. Extra filters are omitted.
- `games.get`: `GET /games/{gameId}`; `gameId` is a required id or slug.

Successful responses are raw provider JSON under AppCall `data`. Writes are not present on this API surface.

## Adaptations

Pinned source and official docs agree on `https://api.rawg.io/api` and the `key` query. Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent. Responses are not reshaped into the OpenConnector `{platforms|genres|games, count}` wrappers.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
