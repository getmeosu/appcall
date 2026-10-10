# Web Scraper Cloud

Web Scraper Cloud API v1 recipe for the international Cloud product operated from Latvia. Configure the API token from https://cloud.webscraper.io/api. The runner sends it as the documented `api_token` query parameter to `https://api.webscraper.io/api/v1`.

Covered HTTP operations include account healthcheck, sitemap list/get/create/update/delete, scraping-job list/get/create/delete/data-quality/problematic-urls, and sitemap scheduler get/enable/disable. EventOnly webhooks cover finished, failed, and stopped scraping jobs.

Responses preserve raw `{success,data}` JSON under `data`. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.
