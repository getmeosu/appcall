# Chatarmin

Read-only Chatarmin public API recipe for chatarmin.com GmbH (Vienna). Configure an API key from Chatarmin dashboard profile settings. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://api.chatarmin.com/api/public`.

Selected operations are `healthcheck` (`GET /contacts?page=1&limit=1`, the pinned credential validator), `contacts.list` (`GET /contacts` with optional `page`/`limit`/`search`), `contacts.get` (`GET /contacts/{contactId}`), `campaigns.list` (`GET /campaigns`), and `flows.list` (`GET /flows`). Writes, WhatsApp send, voucher pools, and webhooks are omitted. Pagination is caller-controlled.

Adaptations versus the pinned OpenConnector source: list/get responses keep raw JSON under `data` instead of source `{data,pagination}` / `{contact}` wrappers; native category is `messaging` (source Marketing/Communication are not in native CATEGORIES); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apidocs.chatarmin.com/reference/api-overview. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`, then `contacts.list` with `page=1` and `limit=1`.
