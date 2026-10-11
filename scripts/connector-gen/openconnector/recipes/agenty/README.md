# Agenty

Agenty API v2 recipe for the international product at `api.agenty.com`, plus Browser API reads at `browser.agenty.com/api`. Configure an API key from Settings → API keys; the runner sends the documented `X-Agenty-ApiKey` header (docs also allow `apikey` as a query parameter).

Covered operations (v0.3.0): origin v0.2.0 agent/job/list/scheduler/input tools plus the remaining Composio AGENTY catalog — agent create/update/templates/transfer/result download, API keys, projects, workflows, users, connections, dashboard reports, list row CRUD/clear/upload/download, job logs/files/CSV export, scheduler get/update/toggle, and Browser API screenshot/pdf/content/extract/redirects/scrape. Returns raw Agenty JSON or text under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://agenty.com/docs/agenty-api/72 and https://agenty.com/docs/agenty-browser-api/197. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `agents.list`.
