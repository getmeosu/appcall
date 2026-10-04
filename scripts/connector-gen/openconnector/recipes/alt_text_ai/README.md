# AltText.ai

International **AltText.ai REST API v1** recipe. Create an API key at https://alttext.ai/account/api_keys and store it as `apiKey`. Requests send `X-API-Key` and `Accept: application/json` to `https://alttext.ai/api/v1`.

## Operations

HTTP actions cover the complete official JSON surface from OpenAPI 1.9.6: account get/update and images list/get/search/create/update/delete/scrape (healthcheck reuses GET /account). Multipart `POST /images/bulk_create` is omitted. EventOnly ImageEvent webhooks: `webhook.uploaded`, `webhook.deleted`.

Successful responses are raw provider JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
