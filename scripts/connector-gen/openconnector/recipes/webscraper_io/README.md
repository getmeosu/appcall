# Web Scraper Cloud

Read-only Web Scraper Cloud API v1 recipe for the international Cloud product operated from Latvia. Configure the API token from https://cloud.webscraper.io/api. The runner sends it as the documented `api_token` query parameter to `https://api.webscraper.io/api/v1` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /account` with empty input (pinned credential validator).
- `sitemaps.list`: `GET /sitemaps` with optional `page` (minimum 1).
- `sitemaps.get`: `GET /sitemap/{sitemap_id}`.
- `scraping-jobs.list`: `GET /scraping-jobs` with optional `page` and `sitemap_id`.
- `scraping-jobs.get`: `GET /scraping-job/{scraping_job_id}`.

Sitemap/job creates, updates, deletes, and JSON Lines downloads are omitted. Native returns the raw `{success,data}` JSON under `data`. HTTP 200 bodies with a non-empty `error`/`message`/`error_message` string fail via `bodyErrorPaths`. `success` is not used as a bodyErrorPath because the success value `true` would trip a boolean path.

## Adaptations

Official PHP client (`webscraperio/api-client-php`) and pinned source send `api_token` as a query parameter. The 2026-09-13 homepage marketing sample uses `Authorization: Bearer`; native follows the PHP client and pinned source rather than that sample. Native category is `utility` (source Data/Developer Tools). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://webscraper.io/documentation/web-scraper-cloud/api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API token, call `healthcheck` with `{}`, then `sitemaps.list`.
