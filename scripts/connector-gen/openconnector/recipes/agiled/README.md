# Agiled

Read-only international Agiled REST API v1 recipe. Configure an API token from Settings > API Settings and the account URL (Brand) from the browser address bar after sign-in, such as `https://your-company.agiled.app`. The runner sends `api_token` as a query parameter and `Brand` as a header to `https://my.agiled.app/api/v1`.

Covered operations: credential-only `healthcheck` (`GET /users`), `contacts.list`, `contacts.get` (`GET /contact/{id}`), `projects.list`, and `tasks.list`. Contact/project/task writes are omitted.

A marketing FAQ claiming Bearer authentication is not used; official OpenAPI and the pinned source use `api_token` plus `Brand`. The API host is fixed at `my.agiled.app`; Brand is a stored account-URL header, not a caller-supplied request host. Pinned source normalizes Brand to an HTTPS origin; native sends the stored value verbatim. Native categories are `crm` and `productivity` (source Productivity/Data). The upstream user-agent is not sent. Responses keep raw Agiled JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.agiled.app/docs and https://help.agiled.app/article/60-how-to-get-agiled-api-key. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token and Brand origin URL, call `healthcheck` with `{}`, then `contacts.list`.
