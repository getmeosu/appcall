# Certn

Read-only CertnCentric API recipe for the Canadian/North America edition. Configure an API key created in the Certn Client Portal under Settings > Integrations > API Keys; the runner sends the official `Authorization: Api-Key` header to `https://api.ca.certn.co`. UK (`api.uk.certn.co`), Asia Pacific (`api.au.certn.co`), and sandbox hosts are not exposed.

Covered operations are credential-only `healthcheck` (`GET /api/public/groups/?page=1&page_size=1`), `groups.list`, `groups.get`, `users.list`, and `packages.list`. Case order/write operations are omitted. List filters that require repeated query keys (`group`, `role`, `permissible_purposes`) are omitted because the native query object cannot emit them exactly.

Responses preserve raw Certn JSON under `data`. Trailing slashes on Certn public paths are preserved. Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key in setup, call `healthcheck` with `{}`, then `groups.list`.
