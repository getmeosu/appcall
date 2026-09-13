# Browserbase

Read-only international Browserbase REST API v1 recipe for Browserbase, Inc. (San Francisco). Copy the API key and Project ID from [Dashboard Settings](https://www.browserbase.com/settings). The runner sends `X-BB-API-Key` and `Accept: application/json` to `https://api.browserbase.com`. `projectId` is a required stored setup field on the fixed host (Algolia-style stored id, not a caller-supplied host).

Covered operations: credential-only `healthcheck` (`GET /v1/projects/{projectId}` using the stored project id), `projects.get` (`GET /v1/projects/{id}`), `projects.usage.get` (`GET /v1/projects/{id}/usage`), `sessions.list` (`GET /v1/sessions` with optional `status` and `q`), and `sessions.get` (`GET /v1/sessions/{id}`). `POST /v1/sessions` is omitted as a billed write. Context create/delete and session release are omitted.

Native category is `dev-tools`. Native omits the upstream user-agent. Native sends `Accept: application/json`; official GET examples send only `X-BB-API-Key`. `projects.usage.get` requires input `id` rather than silently substituting the stored project id. Session list returns a JSON array under `data`. Responses keep raw Browserbase JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.browserbase.com/reference/api/list-projects and https://docs.browserbase.com/reference/api/get-project-usage. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key and project ID, call `healthcheck` with `{}`, then `projects.usage.get` with the project id.
