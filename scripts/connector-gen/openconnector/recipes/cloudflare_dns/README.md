# Cloudflare DNS

Read-only international Cloudflare DNS API recipe for Cloudflare, Inc. (San Francisco). Create an API token with Zone Read and DNS Read from [API Tokens](https://dash.cloudflare.com/profile/api-tokens). The runner sends `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.cloudflare.com/client/v4`.

Covered operations: credential-only `healthcheck` (`GET /zones`), `accounts.list` (`GET /accounts` with optional `page` and `per_page`), `zones.list` (`GET /zones` with optional `page`, `per_page`, `name`, `status`), `zones.get` (`GET /zones/{zoneId}`), and `dns-records.list` (`GET /zones/{zoneId}/dns_records` with optional `page`, `per_page`, `type`, `name`). DNS record create/update/delete are omitted as writes. Healthcheck uses `GET /zones` rather than `GET /user/tokens/verify` so account-owned tokens still authenticate.

Native category is `dev-tools` (source Developer Tools/Security). HTTP 200 envelopes with a populated `errors` array are demoted via `bodyErrorPaths`. `success` is not used as a body-error path because `true` would false-fail. The upstream user-agent is not sent. OAuth2 is omitted. Responses keep raw Cloudflare JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.cloudflare.com/api/typescript/resources/zones/methods/list/ and https://developers.cloudflare.com/api/node/resources/dns/subresources/records/methods/list/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `zones.list`.
