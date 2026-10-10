# Parma

Parma CRM recipe for the international relationship CRM at parma.ai (Sunnyvale, California). Create a workspace API token at https://app.parma.ai/api and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://app.parma.ai`. Pipedream also documents OAuth; this native edition uses the API token.

Selected operations cover origin `healthcheck` plus every Composio `PARMA_*` HTTP tool that targets Parma CRM (21 of 23 catalog tools). `PARMA_DATA_JSON` and `PARMA_PACKAGE_LIST` are Comune di Parma CKAN open-data endpoints, not app.parma.ai, and are omitted so the connector stays on a single bounded host.

- Auth: `healthcheck` and `currentUser.get` (`GET /api/v1/users/me`).
- Users: `users.list` (`GET /api/v1/users`, optional `page`), `users.get`.
- Pipelines and stages: `pipelines.list`, `pipelines.get`, `stages.list`, `stages.get`.
- Deals: `deals.list` (`GET /api/v1/deals`, optional opaque `page`).
- Groups: `groups.list` (optional `query` and `page`).
- Notes: `notes.list`, `notes.create`, `notes.update`.
- Relationships: `relationships.list` with pinned contact-detail filters, `relationships.create`, `relationships.get`, `relationships.update`, `relationships.delete`.
- Relationship groups: `relationships.groups.list`, `relationships.groups.add`, `relationships.groups.remove`.
- Relationship notes: `relationships.notes.list`.

Adaptations versus the pinned OpenConnector source: GET/DELETE omit `Content-Type` and the upstream user-agent; responses keep raw Parma JSON under `data` instead of unwrapping `data.user`; native category is `crm` (source Productivity/Data are not in native CATEGORIES). Empty HTTP 204 deletes wrap `data: null` and omit `request.result` so the raw JSON contract stays truthful. `users.list` and `groups.list` accept optional `page` to match Composio. Parma wraps actions in a local `action()` helper, so catalog admission uses a reviewed-action-ids row.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.parma.ai/api-docs/index.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `relationships.list`.
