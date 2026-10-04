# DNSFilter

DNSFilter REST API v1 recipe. Configure a dashboard API token from Account Settings > Security > API Keys. The runner sends the token in the `Authorization` header without a Bearer prefix to `https://api.dnsfilter.com`, plus `Accept: application/json`.

Selected operations cover current-user healthcheck, categories, organizations, policies (including allow/block domain updates), networks, users, and block pages. JSON:API pagination uses `pageNumber` / `pageSize` bound to `page[number]` / `page[size]`. Writes use the documented JSON bodies. Deletes that return HTTP 204 map to `{ deleted: true }`. DNSFilter does not publish inbound account webhooks on this API, so no EventOnly webhook operations are declared.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0), plus official DNSFilter OpenAPI at https://apidocs.dnsfilter.com. Official key docs: https://help.dnsfilter.com/hc/en-us/articles/21169189058323-API-Keys. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API token, call `healthcheck` with `{}`, then `categories.list`.
