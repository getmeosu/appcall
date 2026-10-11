# Browser Use

International Browser Use Cloud API v4 recipe with v3 billing. Create an API key at [cloud settings](https://cloud.browser-use.com/settings?tab=api-keys&new=1) (keys start with `bu_`). The runner sends `X-Browser-Use-API-Key` and `Accept: application/json`. Default base URL is `https://api.browser-use.com/api/v4`. `healthcheck` and `billing.account.get` override to `https://api.browser-use.com/api/v3`.

Covered operations: credential-only `healthcheck` and `billing.account.get` (`GET /billing/account` on v3) plus Composio `BROWSER_USE` tools for v4 runs, conversation sessions, queued messages, share links, managed browsers, profiles, workspaces, integrations, and AgentCard wallets.

Native category is `dev-tools` (source AI / Developer Tools). Native omits the upstream user-agent. `skipDnsValidation` is an upstream SDK concern; native pins `api.browser-use.com`. Responses keep raw Browser Use JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.browser-use.com/cloud/api-v4-overview and https://docs.browser-use.com/cloud/api-v3/billing/get-account-billing. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `billing.account.get`.
