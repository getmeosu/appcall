# Bright Data

Read-only international Bright Data Account and Marketplace Dataset API recipe for Bright Data Ltd. (Netanya, Israel). Create an API key at [account settings](https://brightdata.com/cp/setting/users). The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.brightdata.com`.

Covered operations: credential-only `healthcheck` and `account.status.get` (`GET /status`), `datasets.list` (`GET /datasets/list`), `datasets.metadata.get` (`GET /datasets/{datasetId}/metadata`), and `dataset.views.list` (`GET /datasets/views`). Dataset filter, trigger, snapshot download/parts, Web Unlocker, SERP, and scrape APIs are omitted as billed collection. Do not use scrape or snapshot-download endpoints as a healthcheck.

Native category is `dev-tools` (source Data / Developer Tools). Native omits the upstream user-agent. `skipDnsValidation` is an upstream SDK concern; native pins `api.brightdata.com`. Responses keep raw Bright Data JSON under `data` (arrays for list endpoints).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.brightdata.com/api-reference/account-management-api/Get_account_status and https://docs.brightdata.com/api-reference/marketplace-dataset-api/get-dataset-list. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `datasets.list`.
