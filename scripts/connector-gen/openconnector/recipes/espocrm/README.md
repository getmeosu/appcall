# EspoCRM

International **EspoCRM Cloud** REST API recipe. Create an API User (Administration → API Users, API Key method) and store the API key as `apiKey` plus the Cloud instance subdomain as `instance` (the `{name}` in `{name}.espocloud.com`). Requests send `X-Api-Key` to `https://<instance>.espocloud.com`. Self-hosted EspoCRM, caller-supplied Site URLs, and custom-domain Ultimate hosts are not admitted.

## Operations

- `healthcheck`: `GET /api/v1/App/user`.
- `metadata.get`: `GET /api/v1/Metadata` with optional `key`.
- `i18n.get`: `GET /api/v1/I18n`.
- `settings.get`: `GET /api/v1/App/settings`.
- `records.list` / `records.get` / `records.create` / `records.update` / `records.delete`: entity CRUD on `/api/v1/{entityType}`.
- `related.list` / `related.link` / `related.unlink`: relationship reads and writes.
- `stream.list`: Stream notes for one record.
- `users.list` / `teams.list`: User and Team lists.
- `attachments.get`: attachment metadata.
- `webhooks.list` / `webhooks.create` / `webhooks.delete`: webhook subscriptions.
- `currencyRates.get`: `GET /api/v1/CurrencyRate`.
- EventOnly webhooks: `webhook.record_created`, `webhook.record_updated`, `webhook.record_deleted`, `webhook.record_related`, `webhook.record_unrelated`.

Successful responses are raw EspoCRM JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.espocrm.com/development/api/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
