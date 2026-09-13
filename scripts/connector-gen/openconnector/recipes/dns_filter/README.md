# DNSFilter

Read-only DNSFilter REST API v1 recipe. Configure a dashboard API token from Account Settings > Security > API Keys. The runner sends the token in the `Authorization` header without a Bearer prefix to `https://api.dnsfilter.com`, plus `Accept: application/json`.

Selected operations are `healthcheck` (`GET /v1/current_user`), `categories.list` (`GET /v1/categories` with optional `page[number]` / `page[size]`), `categories.get` (`GET /v1/categories/{id}`), `policies.list` (`GET /v1/policies` with optional organization and pagination filters), and `networks.list` (`GET /v1/networks` with optional search and pagination). Writes, application-category fanout, and `get_my_ip` are omitted. Native returns raw JSON:API under `data` rather than the pinned source `{user}` / `{items, links}` wrappers.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official key docs: https://help.dnsfilter.com/hc/en-us/articles/21169189058323-API-Keys. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API token, call `healthcheck` with `{}`, then `categories.list`.
