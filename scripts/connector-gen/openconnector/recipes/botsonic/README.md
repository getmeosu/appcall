# Botsonic

Read-only Botsonic Business REST API recipe for Writesonic, Inc. (Delaware; San Francisco HQ). Configure a bot API token from the Botsonic dashboard Integration Page → REST API. The runner sends `X-BOT-KEY` to `https://api.botsonic.ai`, plus `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /v1/business/bot-faq/all?page=1&size=1`), `faqs.list`, `conversations.list`, and `conversations.get`. Billed `POST /v1/business/botsonic` generation, FAQ writes, starter-question writes, and bot management endpoints are omitted.

Adaptations versus the pinned OpenConnector source: native category is `messaging` (source AI / Communication are not in Rust CATEGORIES); optional FAQ/conversation search and sort filters are omitted; `chat_id` is a required non-empty string because native strict-generated schemas reject `format: uuid`; the upstream user-agent is not sent. Responses keep raw Botsonic JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.botsonic.com/docs/rest-api. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the bot API token, call `healthcheck` with `{}`, then `faqs.list`.
