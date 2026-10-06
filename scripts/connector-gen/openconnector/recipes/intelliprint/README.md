# Intelliprint

International **Intelliprint API v1** recipe. Create an API key under the account API keys page at https://account.intelliprint.net/api_keys. Store it as `apiKey`. Requests send `Authorization: Bearer {{apiKey}}` and `Accept: application/json` to `https://api.intelliprint.net/v1`.

## Operations

Print jobs, backgrounds, mailing lists, and mailing-list recipients covering list/get/create/update/delete. Healthcheck remains `GET /prints?limit=1`. EventOnly webhooks: `webhook.letter_updated`, `webhook.mailing_list_addresses_validated`.

Successful responses are raw provider JSON under AppCall `data`. Multipart file uploads use a base64 `{content,name}` object. Nested letter-status filters and field projection are omitted.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
