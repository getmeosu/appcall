# Agenty

Agenty API v2 recipe for the international product at `api.agenty.com`. Configure an API key from Settings → API keys; the runner sends the documented `X-Agenty-ApiKey` header (docs also allow `apikey` as a query parameter). Browser API hosts `browser.agenty.com` and `api.agenty.ai` are separate and are not exposed.

Covered operations (v0.2.0): credential-only `healthcheck` (`GET /agents`), agent list/get/clone/delete and latest `agents.results`, job list/get/start/stop/result/export, list CRUD plus row list/insert, scheduler create/delete, and input get/update. Team-member and API-key management remain omitted. Returns raw Agenty JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://agenty.com/docs/agenty-api/72. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `agents.list`.
