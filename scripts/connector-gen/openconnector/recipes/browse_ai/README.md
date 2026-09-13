# Browse AI

Read-only international Browse AI REST API v2 recipe for Browse AI (Canada; AWS US). Create a secret API key in the dashboard API tab. The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.browse.ai/v2`.

Covered operations: credential-only `healthcheck` and `robots.list` (`GET /robots`), `robots.get` (`GET /robots/{robotId}`), `tasks.list` (`GET /robots/{robotId}/tasks` with optional `page`, `pageSize`, `status`), and `tasks.get` (`GET /robots/{robotId}/tasks/{taskId}`). `POST /robots/{robotId}/tasks` consumes credits and is omitted. Cookie updates and bulk runs are omitted. Official `GET /v2/status` is unbilled but is not a pinned upstream action, so it is not used as healthcheck.

Native category is `dev-tools` (source Data / Developer Tools). Native omits the upstream user-agent. `skipDnsValidation` is an upstream SDK concern; native pins `api.browse.ai`. Task list admits optional `page` (minimum 1), `pageSize` (1–10), and `status` (`failed` | `successful` | `in-progress`); bulk-run, sort, includeRetried, and date filters from the pinned action are omitted. Responses keep raw Browse AI JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.browse.ai/docs/api/v2 and https://help.browse.ai/en/articles/12683249-api-guide-getting-started. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `robots.list`.
