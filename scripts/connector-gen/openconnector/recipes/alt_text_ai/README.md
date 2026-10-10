# AltText.ai

International **AltText.ai REST API v1** recipe covering the Composio ALTTEXT_AI toolkit. Create an API key at https://alttext.ai/account/api_keys and store it as `apiKey`. Requests send `X-API-Key` and `Accept: application/json` to `https://alttext.ai/api/v1`.

## Operations

- `healthcheck`: `GET /account` with empty input (pinned credential validator).
- `account.get`: same `GET /account` (ALTTEXT_AI_GET_ACCOUNT).
- `account.update`: `PUT /account` with a nested `account` object (ALTTEXT_AI_UPDATE_ACCOUNT).
- `images.list`: `GET /images` with optional `page`, `limit` (1–100), and `url` (ALTTEXT_AI_GET_IMAGES).
- `images.get`: `GET /images/{asset_id}` (ALTTEXT_AI_GET_IMAGE_BY_ASSET_ID).
- `images.search`: `GET /images/search`; required `query` binds to `q`. Optional `page`, `limit`, and Composio `per_page` (ALTTEXT_AI_SEARCH_IMAGES).
- `images.create`: `POST /images` with nested `image` (url or raw) plus generation options. `async_mode` maps to official `async` (ALTTEXT_AI_CREATE_IMAGE).
- `images.bulk_create`: handwritten multipart `POST /images/bulk_create` (ALTTEXT_AI_CREATE_BULK_IMAGES).
- `images.update`: `PUT /images/{asset_id}` with nested `image` (ALTTEXT_AI_UPDATE_IMAGE_BY_ASSET_ID).
- `images.delete`: `DELETE /images/{asset_id}` (ALTTEXT_AI_DELETE_IMAGE_BY_ASSET_ID).
- `images.scrape`: `POST /images/page_scrape` with nested `page_scrape` (ALTTEXT_AI_SCRAPE_PAGE).

Successful responses are raw provider JSON under AppCall `data`. Composio lists 0 triggers; EventOnly ImageEvent webhooks are not declared.

## Adaptations

Pinned source and official docs agree on `https://alttext.ai/api/v1` and `X-API-Key`. Native category is `utility` (source AI / Design & Media are not in the Rust CATEGORIES allowlist). Native returns the raw JSON body under `data` and does not reconstruct pagination from response headers. The upstream user-agent is not sent. Bulk CSV upload is multipart and therefore a handwritten handler.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
