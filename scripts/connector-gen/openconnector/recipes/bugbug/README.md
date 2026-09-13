# BugBug

Read-only international **BugBug Public API v2** recipe for TestRevolution Sp. z o.o. (Poland). Configure the project API token from BugBug Integrations > API. Requests send `Authorization: Token <token>` and `Accept: application/json` to `https://app.bugbug.io`.

Covered operations: credential-only `healthcheck` (`GET /api/v2/tests/?page=1&page_size=1`), `tests.list`, `tests.get`, `suites.list`, and `profiles.list`. Writes, test-run execution, and suite-get are omitted. List endpoints admit optional `page`, `page_size`, `query`, and `ordering` where the official API documents them.

Official docs live at `https://docs.bugbug.io/integrations/public-api` and the OpenAPI reference under `https://docs.bugbug.io/public-api-reference/tests`. Native category is `dev-tools` (source Developer Tools). Host is `app.bugbug.io` with OpenAPI `/api/v2/` paths; the GitBook curl host `api.bugbug.io/v2` is recorded as an adaptation.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `tests.list`.
