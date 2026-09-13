# Ahrefs

Read-only international Ahrefs API v3 recipe. Create an API key in Account settings → API keys. The runner sends `Authorization: Bearer` plus `output=json` to `https://api.ahrefs.com/v3`.

## Operations

- `healthcheck`: `GET /subscription-info/limits-and-usage` (officially free; does not consume API units)
- `site-explorer.metrics`: `GET /site-explorer/metrics` with required `target` and `date`
- `site-explorer.metrics-by-country`: `GET /site-explorer/metrics-by-country` with required `target` and `date`
- `keywords-explorer.overview`: `GET /keywords-explorer/overview` with required `country` and `select`

Site Explorer and Keywords Explorer reads consume API units and are not used as the healthcheck.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.ahrefs.com/api/docs/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
