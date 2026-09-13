# SaaS Custom Domains

Read-only international SaaS Custom Domains API recipe. Configure the API token from Settings > API in the SaaS Custom Domains dashboard. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://app.saascustomdomains.com/api/v1`.

Selected operations are `healthcheck` (`GET /accounts`, the pinned credential validator), `upstreams.list`, `upstreams.get`, `custom-domains.list`, and `custom-domains.get`. Path identifiers are required and URL-encoded. Optional `host`, `page`, and `per_page` bind to documented query names. Official `GET /api/v1/me` is not a pinned action and is not exposed. Form-urlencoded writes, DNS verification, and HTTP cache purge are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.saascustomdomains.com/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API token, call `healthcheck` with `{}`, then `upstreams.list` with an account UUID.
