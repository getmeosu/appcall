# Bright Data

International Bright Data Account, Marketplace Dataset, Scraper, SERP, Web Unlocker, Archive, and Deep Lookup API recipe for Bright Data Ltd. (Netanya, Israel). Create an API key at [account settings](https://brightdata.com/cp/setting/users). The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.brightdata.com`.

Covered operations (26): origin `healthcheck` and `account.status.get` (`GET /status`), `datasets.list`, `datasets.metadata.get`, `dataset.views.list`, plus every Composio `BRIGHTDATA_*` HTTP tool. Crawl, scrape, snapshot download, filter, Web Unlocker, SERP, Archive, Deep Lookup, and zone admin calls are billed collection or infrastructure changes.

Native category is `dev-tools`. Native omits the upstream user-agent. `skipDnsValidation` is an upstream SDK concern; native pins `api.brightdata.com`. Responses keep raw Bright Data JSON under `data` (arrays for list endpoints). Optional query and body fields are omitted when unset.

`zones.create` always sends the official SERP safe plan (`zone.type=serp`, `plan.type=unblocker`, `plan.serp=true`). `product=scraping_browser` is accepted and does not switch to `browser_api`. `serp.search` posts `{query:{q}, country, brd_json}` to `POST /serp/req`; `search_engine` and `data_format` are accepted and not sent. `FILTER_DATASET` file uploads are omitted. Origin `datasets.metadata.get` keeps `datasetId`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.brightdata.com/api-reference/account-management-api/Get_account_status. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
