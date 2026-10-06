# Cronitor

Cronitor is an international monitoring API. This recipe uses current API version `2025-11-28` at `https://cronitor.io/api`.

## Setup

Create an SDK Integration key, or a custom key with `monitor:read` plus the scopes you need, in Cronitor's [API Settings](https://cronitor.io/app/settings/api). Store it as `apiKey`. Cronitor uses HTTP Basic auth with the API key as username and an empty password, so requests send `Authorization: Basic <base64(apiKey:)>`, plus `Accept: application/json` and `Cronitor-Version: 2025-11-28`.

## Operations

- `healthcheck`: `GET /monitors` with empty input.
- `monitors.list`: `GET /monitors` with optional `type`, `group`, `page`, and `pageSize`.
- `monitors.get`: `GET /monitors/{key}`; the required nonempty key is percent-encoded as one path segment.
- `monitors.create`: `POST /monitors` with required `key` and `type`.
- `monitors.update`: `PUT /monitors/{key}`.
- `monitors.delete`: `DELETE /monitors/{key}`.
- `monitors.pause`: `GET /monitors/{key}/pause/{hours}`; `hours=0` resumes.
- `monitors.clone`: `POST /monitors/clone`.
- `issues.list`: `GET /issues`.
- `issues.get`: `GET /issues/{key}`.
- `issues.create`: `POST /issues`.
- `issues.update`: `PUT /issues/{key}`.
- `issues.delete`: `DELETE /issues/{key}`.
- `statuspages.list`: `GET /statuspages`.
- `groups.list`: `GET /groups`.
- `environments.list`: `GET /environments`.
- `webhook.alert` / `webhook.recovery`: EventOnly inbound webhooks. Cronitor POSTs `type=ALERT` or `type=RECOVERY` when a monitor fails or recovers.

Successful HTTP responses are preserved as raw provider JSON under AppCall `data`, except deletes which return `{ deleted, key }`.

## Testing and live smoke

Fixtures are supplied evidence only. The deterministic fixture key `fixture-api-token` uses `Basic Zml4dHVyZS1hcGktdG9rZW46` (empty password). Fixtures do not prove live credentials or availability.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
