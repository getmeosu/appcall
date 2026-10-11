# MaintainX

International **MaintainX REST API v1** recipe covering the origin healthcheck plus every Composio `MAINTAINX_*` HTTP tool (30 tools, 32 operations including origin `healthcheck` and `users.list`).

## Setup

Generate an API key under Settings > Integrations > API Keys. Store it as `apiKey`. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://api.getmaintainx.com/v1`.

## Operations

- Origin reads: `healthcheck` (`GET /locations?limit=1`), `locations.list` / `locations.get`, `work-orders.list`, `users.list`.
- Categories, locations, procedure templates, work orders, work-order comments, work requests, and work-request portals (create/list/get/update as Composio lists them).
- Assets and categories delete (`DELETE` 204 → `{success: true}`).
- Lists: asset criticalities, assets, meters, parts, procedure templates, teams, work requests, work-request portals.
- Gets: user, vendor, work-order costs.
- `entities.find` is `GET /{entity_type}` for workorders, users, locations, assets, or teams.
- Vendor attachment upload is `PUT /vendors/{id}/attachments/{filename}` as `application/octet-stream`.
- Work-order status is `PATCH /workorders/{id}/status`.

Composio snake_case fields map to official camelCase JSON/query names (`asset_id` → `assetId`, `not_assets` → `notAssets`). Official `show_upcoming` is already snake_case. `user_ids` / `team_ids` are accepted on create; send official `assignees` `[{type,id}]` to assign. `search_query` on find is accepted; filter names differ by collection so only cursor/limit are forwarded unless title/name/email/sort are supplied. Successful JSON responses are raw provider JSON under AppCall `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://api.getmaintainx.com/latest/docs. Live authentication is unverified.
