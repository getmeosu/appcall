# Avochato

Read-only Avochato REST API recipe. Configure Auth ID and Auth Secret from Settings > API Access. The runner sends `auth_id` and `auth_secret` as query parameters to `https://www.avochato.com`, plus `Accept: application/json`.

Selected operations are `healthcheck` (`GET /v1/whoami`), `contacts.list` (`GET /v1/contacts` with optional `after_page` and `limit`), `messages.list` (`GET /v1/messages` with optional query, page, direction, status, from, to, and created_at range), and `messages.get` (`GET /v1/messages/{eventId}`). Contact-id fanout, contact upsert, and message send are omitted. `eventId` is a required string and is URL-encoded as a path segment.

Adaptations versus the pinned OpenConnector source: dual query auth uses `http.auth` for `auth_id` (setup `apiKey`) plus `http.query auth_secret`; GET requests omit `Content-Type` because the source only sets it when a JSON body is present; the upstream user-agent is not sent; responses keep raw provider JSON under `data` instead of the source `{account,user}` / `{contacts}` wrappers. Native category is `messaging` (source Communication/Marketing).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.avochato.com/docs. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure both setup fields, call `healthcheck` with `{}`, then `contacts.list`.
