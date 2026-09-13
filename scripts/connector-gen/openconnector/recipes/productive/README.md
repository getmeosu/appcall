# Productive

Read-only international Productive JSON:API v2 recipe. Configure a personal API token from Settings > API integrations and the numeric organization ID. Requests send `X-Auth-Token`, `X-Organization-Id`, and `Accept: application/vnd.api+json` to `https://api.productive.io/api/v2`.

Covered operations: credential-only `healthcheck` (`GET /tasks`), `tasks.list`, `tasks.get`, and `time-entries.list`. Optional `pageNumber` / `pageSize` bind to official `page[number]` / `page[size]` (size 1–200). Optional `sort` and `include` are forwarded. Dynamic `filter[...]` maps, writes, and JSON:API mutation bodies are omitted. Provider next links are never followed.

Adaptations: healthcheck maps to `list_tasks` because `GET /organization` exists only in credential validation and is not an upstream action. `organizationId` is a required stored setup field, not an operation input. Native GETs omit `Content-Type`. Raw JSON:API JSON is returned under `data`. Native category is `productivity`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://developer.productive.io/reference. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
