# Browser Use

Read-only international Browser Use Cloud API v3 recipe. Create an API key at [cloud settings](https://cloud.browser-use.com/settings?tab=api-keys&new=1) (keys start with `bu_`). The runner sends `X-Browser-Use-API-Key` and `Accept: application/json` to `https://api.browser-use.com/api/v3`.

Covered operations: credential-only `healthcheck` and `billing.account.get` (`GET /billing/account`), `sessions.list` (`GET /sessions` with optional `page` and `pageSize`), and `sessions.get` (`GET /sessions/{sessionId}`). `POST /sessions` is omitted as a billed write. Session stop and message list are omitted. This edition is v3 only; v4 browsers/profiles/workspaces proxy routing is not expressed.

Native category is `dev-tools` (source AI / Developer Tools). Native omits the upstream user-agent and `Content-Type` on GET (pinned source always sends `Content-Type: application/json`; official GET examples send only the API key). `skipDnsValidation` is an upstream SDK concern; native pins `api.browser-use.com`. Optional `pageSize` maps to official query `page_size`. Responses keep raw Browser Use JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.browser-use.com/cloud/api-v3/billing/get-account-billing and https://docs.browser-use.com/cloud/api-v3/sessions/list-sessions. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `billing.account.get`.
