# AltText.ai

Read-only international **AltText.ai REST API v1** recipe. Create an API key at https://alttext.ai/account/api_keys and store it as `apiKey`. Requests send `X-API-Key` and `Accept: application/json` to `https://alttext.ai/api/v1`.

## Operations

- `healthcheck`: `GET /account` with empty input (pinned credential validator). Not billed image generation.
- `account.get`: same `GET /account`.
- `images.list`: `GET /images` with optional `page`, `limit` (1–100), and `url`.
- `images.get`: `GET /images/{asset_id}`; `asset_id` is required.
- `images.search`: `GET /images/search`; required `query` binds to `q`, optional `page` and `limit`.

Successful responses are raw provider JSON under AppCall `data`. `create_image`, `scrape_page`, and `delete_image` are omitted because generation consumes credits.

## Adaptations

Pinned source and official docs agree on `https://alttext.ai/api/v1` and `X-API-Key`. Native category is `utility` (source AI / Design & Media are not in the Rust CATEGORIES allowlist). Native returns the raw JSON body under `data` and does not reconstruct pagination from response headers the way the pinned list/search handlers do. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
