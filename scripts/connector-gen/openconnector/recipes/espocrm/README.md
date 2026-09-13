# EspoCRM

Read-only international **EspoCRM Cloud** REST API recipe. Create an API User (Administration → API Users, API Key method) and store the API key as `apiKey` plus the Cloud instance subdomain as `instance` (the `{name}` in `{name}.espocloud.com`). Requests send `X-Api-Key` to `https://<instance>.espocloud.com`. Self-hosted EspoCRM, caller-supplied Site URLs, and custom-domain Ultimate hosts are not admitted.

## Operations

- `healthcheck`: `GET /api/v1/App/user` (cheap authenticated current-user read).
- `metadata.get`: `GET /api/v1/Metadata` with optional `key`.
- `records.list`: `GET /api/v1/{entityType}` with required `entityType` and optional `maxSize` (1–200).
- `records.get`: `GET /api/v1/{entityType}/{recordId}`.

Successful responses are raw EspoCRM JSON under AppCall `data`. Writes, HMAC signing, JSON `where` clauses, and offset/order query params are omitted.

## Adaptations

Pinned source accepted any HTTPS `baseUrl`. Native pins EspoCRM Cloud `*.espocloud.com` hosts via required stored `instance` (Algolia/Grafana-style). Native category is `crm` (source Marketing is not in the Rust CATEGORIES allowlist).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.espocrm.com/development/api/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
