# Parma

Read-only Parma CRM recipe for the international relationship CRM at parma.ai (Sunnyvale, California). Create a workspace API token at https://app.parma.ai/api and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://app.parma.ai`. Pipedream also documents OAuth; this native edition uses the API token.

Selected operations are `healthcheck` and `currentUser.get` (`GET /api/v1/users/me`), `pipelines.list` (`GET /api/v1/pipelines`), `users.list` (`GET /api/v1/users`), and `deals.list` (`GET /api/v1/deals` with optional opaque `page`). Healthcheck uses the current-user probe rather than a search. Notes, relationship writes, and deletes are omitted.

Adaptations versus the pinned OpenConnector source: GET requests omit `Content-Type` and the upstream user-agent; responses keep raw Parma JSON under `data` instead of unwrapping `data.user`; native category is `crm` (source Productivity/Data are not in native CATEGORIES). Parma wraps actions in a local `action()` helper, so catalog admission uses a reviewed-action-ids row.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.parma.ai/api-docs/index.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `pipelines.list`.
