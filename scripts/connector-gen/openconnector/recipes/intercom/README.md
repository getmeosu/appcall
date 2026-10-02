# Intercom

International Intercom recipe using the US API host `api.intercom.io` and an API token in `Authorization`; EU/AU regional hosts are documented by Intercom but are outside this fixed-host recipe. Auth remains `api_key` / Bearer `accessToken` with `Intercom-Version: 2.13`.

## Operations

- `healthcheck`: `GET /me` (credential-only).
- `admins.list`: `GET /admins` with optional `display_avatar`.
- `contacts.list`: `GET /contacts` with `per_page` / `starting_after`.
- `companies.list`: `POST /companies/list` with bounded page/per_page/order/starting_after.
- **P0 conversations**: `conversations.list` (`GET /conversations`), `conversations.get` (`GET /conversations/{id}`), `conversations.reply` (`POST /conversations/{id}/reply` as admin comment/note).

Runner depth lives under `runner/connectors/intercom/src/` (http/objects/sync) with inject-fetch tests. Source attribution: Oomol Open Connector, pinned revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Live smoke: supply an Intercom API token and call `healthcheck`, then one list operation (and optionally a conversation get). Live evidence remains unverified. Outclass note: Composio exposes ~133 Intercom ops; this cut is scaffold + first P0 conversations slice only.
