# Laposta

International **Laposta v2 API** recipe covering the Composio `LAPOSTA` toolkit (25 tools) plus origin `healthcheck`. Create an API key from Access & Subscription > Links - API (Koppelingen) and store it as `apiKey`. Requests send HTTP Basic authentication (API key as username, empty password) and `Accept: application/json` to `https://api.laposta.org`.

## Operations

- `healthcheck` / `lists.list`: `GET /v2/list`.
- Lists: get/create/update/delete plus `lists.members.clear` (`DELETE /v2/list/{list_id}/members`).
- Members: list/get/create/update/delete. Create/update flatten `custom_fields` and `options` onto `custom_fields[name]` / `options[upsert]` form keys via a handwritten encoder (declarative form bodies reject nested objects).
- Fields: list/get/create/update/delete. Create flattens `options[]`. Update sends JSON so Composio `options_full` arrays match the official JSON contract.
- Segments: list/get.
- Webhooks: list/get/create/update/delete against the Laposta webhook subscription API (`sideEffect` follows HTTP method; these are not inbound AppCall triggers).
- `campaigns.list`: `GET /v2/campaign`.
- `reports.list`: `GET /v2/report`.

Successful responses are raw provider JSON under AppCall `data`. POST writes use `application/x-www-form-urlencoded` except `fields.update`, which uses JSON.

## Adaptations

Official English Default API URL is `https://api.laposta.org/`. Pinned source used `https://api.laposta.nl`; native follows the official English host. Native category is `email-marketing`. Pinned source double-encodes `+` in member emails as `%252B`; native `encodeURIComponent` encodes `+` once as `%2B`. Pinned open-connector omitted writes; native adds official list/member/field/segment/webhook/campaign/report HTTP tools.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
