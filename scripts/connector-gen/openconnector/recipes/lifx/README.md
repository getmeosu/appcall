# LIFX

Read-only LIFX HTTP API v1 recipe. Generate a personal access token at [LIFX Cloud settings](https://cloud.lifx.com/settings) and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.lifx.com/v1`.

## Operations

- `healthcheck`: `GET /lights/all` (cheap authenticated read; matches pinned credential validation).
- `lights.list`: `GET /lights/{selector}` with required selector (`all`, `id:…`, `group:…`, or another documented selector).
- `scenes.list`: `GET /scenes`.
- `color.validate`: `GET /color?string=` (native input name is `color`).

Successful responses are raw provider JSON under AppCall `data` (arrays for lights and scenes). Set-state, toggle, activate-scene, and effects-off writes are omitted.

## Adaptations

Official docs call the Cloud settings token an OAuth 2 access token. Native uses `Authorization: Bearer` because the documented live path is a generated personal token, not an OAuth authorization-code exchange. Native category is `utility` (source Developer Tools is not in the Rust CATEGORIES allowlist). Selectors in the path are URL-encoded. Pinned source defaults an omitted list selector to `all`; native requires the caller to send the selector.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
