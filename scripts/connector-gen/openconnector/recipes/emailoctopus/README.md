# EmailOctopus

This recipe targets the international EmailOctopus **API v2** at `https://api.emailoctopus.com`, owned and operated by Three Hearts Digital Ltd. Origin 0.1.0 spoke legacy API 1.6 (`emailoctopus.com/api/1.6` + `api_key` query). Composio's 20 tools are v2, so this edition uses bearer auth and cursor pagination. The upstream Open Connector source is pinned to `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

## Setup

Create a v2 API key at https://api.emailoctopus.com/developer/api-keys/create (keys minted before October 2024 are v1-only) and store it in `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json`. Do not add `api_key` to operation input.

## Operations

- Auth: `healthcheck` (`GET /lists?limit=1`).
- Lists: `lists.list` (`EMAILOCTOPUS_GET_ALL_LISTS`; `starting_after` replaces origin `page`), `lists.get`, `lists.create`, `lists.update`, `lists.delete`.
- Contacts: `contacts.list`, `contacts.get`, `contacts.create`, `contacts.upsert`, `contacts.unsubscribe` (PUT status `unsubscribed`), `contacts.delete`, `contacts.batch`.
- Fields: `fields.create`, `fields.update` (path `current_tag`), `fields.delete`.
- Tags: `tags.list`, `tags.create`, `tags.update` (`new_tag` → body `tag`), `tags.delete`.
- Campaigns: `campaigns.list` (`EMAILOCTOPUS_GET_RECENT_CAMPAIGNS`).

`contacts.list` maps Composio `created_at_gte` / `last_updated_at_lte` onto official `created_at.gte` / `last_updated_at.lte` query parameters. DELETE 204 responses return `{deleted: true}`. Pagination is caller controlled via `limit` (1–100) and `starting_after`; AppCall never follows provider next URLs. Composio triggers = 0.

Primary reference: https://emailoctopus.com/api-documentation/v2. Composio: https://docs.composio.dev/toolkits/emailoctopus.

## Evidence status

Fixtures are supplied contract fixtures. Live authentication and live provider behavior remain unverified. Security coverage was bounded and dated 2026-09-13 using the API reference, https://emailoctopus.com/legal/privacy, and https://emailoctopus.com/legal/terms. No breach-free claim is made.
