# Listen Notes

International **Listen Notes Podcast API v2** recipe. Create a key in the [Listen API dashboard](https://www.listennotes.com/api/dashboard/) and store it as `apiKey`. Requests send `X-ListenAPI-Key` and `Accept: application/json` to `https://listen-api.listennotes.com/api/v2`.

Covered operations: origin `healthcheck` (`GET /languages`), `languages.list`, `genres.list`, `regions.list`, and `podcasts.get`, plus the remaining Composio LISTENNOTES tools (full-text search, typeahead, best podcasts, episode get/batch/recommendations, podcast batch/recommendations/audience/domain/submit/delete/RSS refresh, curated lists, playlists, trending and related searches, episode-title search, just_listen, and spellcheck). Inbound Listen Notes dashboard webhooks are omitted because Composio lists 0 triggers.

Successful responses are raw Listen Notes JSON under AppCall `data`. Batch podcast/episode fetches and podcast submit use official `application/x-www-form-urlencoded` bodies. Integer 0/1 flags (`safe_mode`, `top_level_only`, `show_transcript`, …) stay integers so native does not encode booleans as `true`/`false`. Optional query and form fields are omitted when unset, so origin callers that send `{}` still hit the origin URLs.

## Adaptations

Pinned source and official OpenAPI agree on `https://listen-api.listennotes.com/api/v2` and `X-ListenAPI-Key`. Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist). Search is omitted as healthcheck because official docs describe it as the quota-limited search endpoint. The upstream user-agent is not sent. Playlist create/update/delete endpoints exist in OpenAPI but are not Composio tools and are not added.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus the Composio toolkit page and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `languages.list`.
