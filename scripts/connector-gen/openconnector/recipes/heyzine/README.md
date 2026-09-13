# Heyzine

Read-only international **Heyzine REST API** recipe. Copy the API key from the Heyzine developers page and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://heyzine.com`.

## Operations

- `healthcheck`: `GET /api1/flipbook-list` with empty input (cheap authenticated list; pinned credential validator).
- `flipbooks.list`: `GET /api1/flipbook-list`. Official list has no pagination query.
- `flipbooks.get`: `GET /api1/flipbook-details?id=`; `id` is required.
- `bookshelves.list`: `GET /api1/bookshelf-list`.
- `bookshelves.flipbooks.list`: `GET /api1/bookshelf-flipbooks?id=`; `id` is required.

Successful responses are raw provider JSON under AppCall `data` (arrays for list endpoints). Conversion, delete, bookshelf mutation, social metadata, password protection, MCP, and client-id link conversion are omitted.

## Adaptations

Official current docs use `GET /api1/flipbook-details` and `GET /api1/bookshelf-flipbooks`. Pinned source used `/api1/flipbook-get` and `/api1/bookshelf-get`; native follows the official paths. Native category is `productivity` (source Design & Media is not in the Rust CATEGORIES allowlist). Heyzine can answer HTTP 200 with `{success:false, msg:...}`; native `bodyErrorPaths` treat a non-empty top-level `msg` as the error signal because they cannot invert a success boolean.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
