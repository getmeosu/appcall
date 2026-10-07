# Ahrefs

Read-only international Ahrefs API v3 recipe. Create an API key in Account settings → API keys. The runner sends `Authorization: Bearer` plus `output=json` to `https://api.ahrefs.com/v3`.

## Operations

- `healthcheck`: `GET /subscription-info/limits-and-usage`
- `site-explorer.metrics`: `GET /site-explorer/metrics`
- `site-explorer.metrics-by-country`: `GET /site-explorer/metrics-by-country`
- `keywords-explorer.overview`: `GET /keywords-explorer/overview`
- `site-explorer.domain-rating`: `GET /site-explorer/domain-rating`
- `site-explorer.backlinks-stats`: `GET /site-explorer/backlinks-stats`
- `site-explorer.outlinks-stats`: `GET /site-explorer/outlinks-stats`
- `site-explorer.organic-keywords`: `GET /site-explorer/organic-keywords`
- `site-explorer.referring-domains`: `GET /site-explorer/referring-domains`
- `site-explorer.all-backlinks`: `GET /site-explorer/all-backlinks`
- `site-explorer.top-pages`: `GET /site-explorer/top-pages`
- `site-explorer.organic-competitors`: `GET /site-explorer/organic-competitors`
- `site-explorer.anchors`: `GET /site-explorer/anchors`
- `site-explorer.pages-by-traffic`: `GET /site-explorer/pages-by-traffic`
- `keywords-explorer.related-terms`: `GET /keywords-explorer/related-terms`
- `keywords-explorer.matching-terms`: `GET /keywords-explorer/matching-terms`
- `keywords-explorer.search-suggestions`: `GET /keywords-explorer/search-suggestions`
- `keywords-explorer.volume-history`: `GET /keywords-explorer/volume-history`
- `keywords-explorer.volume-by-country`: `GET /keywords-explorer/volume-by-country`
- `serp-overview.serp-overview`: `GET /serp-overview/serp-overview`

Site Explorer, Keywords Explorer, and SERP Overview reads consume API units and are not used as the healthcheck.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.ahrefs.com/api/docs/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
