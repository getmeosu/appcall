# Listen Notes

Read-only international **Listen Notes Podcast API v2** recipe. Create a key in the [Listen API dashboard](https://www.listennotes.com/api/dashboard/) and store it as `apiKey`. Requests send `X-ListenAPI-Key` and `Accept: application/json` to `https://listen-api.listennotes.com/api/v2`.

## Operations

- `healthcheck`: `GET /languages` with empty input (pinned credential probe; not full-text search).
- `languages.list`: `GET /languages`.
- `genres.list`: `GET /genres`.
- `regions.list`: `GET /regions`.
- `podcasts.get`: `GET /podcasts/{id}` with optional `sort` (`oldest_first` or `recent_first`) and `nextEpisodePubDate` (`next_episode_pub_date`).

Successful responses are raw Listen Notes JSON under AppCall `data`. Full-text `GET /search`, typeahead, best-podcasts ranking, and recommendations are omitted. Official `top_level_only` 0/1 on genres is omitted so native does not encode a boolean as `true`/`false`.

## Adaptations

Pinned source and official OpenAPI agree on `https://listen-api.listennotes.com/api/v2` and `X-ListenAPI-Key`. Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist). Search is omitted as healthcheck because official docs describe it as the quota-limited search endpoint. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
