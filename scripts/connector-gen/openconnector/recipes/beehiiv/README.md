# Beehiiv

Read-only international **Beehiiv REST API v2** recipe. Create an API key under Settings > Integrations > API and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.beehiiv.com/v2`.

## Operations

- `healthcheck`: `GET /publications?limit=1` (cheap authenticated read; pinned credential validator).
- `publications.list`: `GET /publications` with optional `limit` (1–100), `page`, `direction`, and `orderBy` (`order_by`).
- `publications.get`: `GET /publications/{publicationId}`.
- `posts.list`: `GET /publications/{publicationId}/posts` with optional `audience`, `platform`, `status`, `limit`, `page`, `orderBy`, `direction`, and `hiddenFromFeed` (`hidden_from_feed`).
- `posts.get`: `GET /publications/{publicationId}/posts/{postId}`.

Successful responses are raw provider JSON under AppCall `data`. Writes, subscription endpoints, and `expand[]` array query appends are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.beehiiv.com/v2` and Bearer API keys. Native category is `email-marketing` (source Marketing/Productivity). OAuth exists but is not required for this edition.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
