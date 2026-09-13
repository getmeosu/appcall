# Cronitor

Cronitor is an international monitoring API. This recipe uses current API version `2025-11-28` at `https://cronitor.io/api`.

## Setup

Create an SDK Integration key, or a custom key with `monitor:read`, in Cronitor's [API Settings](https://cronitor.io/app/settings/api). Store it as `apiKey`. Cronitor uses HTTP Basic auth with the API key as username and an empty password, so requests send `Authorization: Basic <base64(apiKey:)>`, plus `Accept: application/json` and `Cronitor-Version: 2025-11-28`.

## Operations

- `healthcheck`: `GET /monitors` with empty input.
- `monitors.list`: `GET /monitors`.
- `monitors.get`: `GET /monitors/{key}`; the required nonempty key is percent-encoded as one path segment.

List requests the documented first page with no query parameters. It does not follow provider links or claim caller-controlled pagination. Cronitor documents optional `page` and `pageSize`; those are outside this fixed subset. Successful responses are preserved as raw provider JSON under AppCall `data`.

## Testing and live smoke

Fixtures are supplied evidence only. They cover success, two distinct monitor keys, missing input, and 401 responses. The deterministic fixture key `fixture-secret` uses `Basic Zml4dHVyZS1zZWNyZXQ6` (empty password). Fixtures do not prove live credentials or availability. For live smoke, use a least-privilege key, invoke `healthcheck`, then `monitors.list` and `monitors.get` with a real key.

Upstream definitions/runtime are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), pinned at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
