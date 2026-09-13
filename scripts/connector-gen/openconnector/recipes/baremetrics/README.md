# Baremetrics

Read-only international Baremetrics API recipe. Store an API key from [Settings → API](https://app.baremetrics.com/settings/api). Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.baremetrics.com`.

## Operations

- `healthcheck`: `GET /v1/sources` with empty input (cheap authenticated source list; the same probe the pinned source uses to validate a key).
- `sources.list`: `GET /v1/sources`.
- `customers.list`: `GET /v1/{sourceId}/customers`. `sourceId` is required (from List Sources) and is percent-encoded as one path segment. Optional official query filters `search`, `sort`, and `order` are omitted.

Writes (create/update customer, plans, subscriptions, charges) are omitted. Provider next URLs are never followed.

## Adaptations

Pinned source and official docs agree on host `https://api.baremetrics.com`, Bearer API key, `GET /v1/sources`, and `GET /v1/{source_id}/customers` with required `source_id`. The native template preserves raw provider JSON under `data` instead of the source `{sources, raw}` / `{customers, raw}` wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.baremetrics.com/, https://developers.baremetrics.com/reference/sources, https://developers.baremetrics.com/reference/list-customers. Fixtures are independently derived and fixture-only; live authentication remains unverified. For live smoke, configure the API key, call `healthcheck` with `{}`, then `customers.list` with a `sourceId` from `sources.list`.
