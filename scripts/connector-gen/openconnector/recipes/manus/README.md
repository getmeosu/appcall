# Manus

Read-only international Manus Open API v2 recipe. Configure an API key from Manus Developers settings. The runner sends `x-manus-api-key` to `api.manus.ai`.

Covered operations: credential-only `healthcheck` (`GET /v2/project.list`), `tasks.list`, `tasks.get`, `connectors.list`, and `agents.list`. Task create/send/stop/delete/update/confirm and project writes are not exposed. Cursor pagination on `tasks.list` is caller-controlled.

Official success bodies are `{ok:true,...}`. Failures may be `{ok:false,error:{code,message}}` even on HTTP 200. Native `bodyErrorPaths` is `["error"]` so a non-empty error object is a connector error; `ok` is not used because boolean `true` would trip a success path.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://open.manus.ai/docs/v2/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `tasks.list`.
