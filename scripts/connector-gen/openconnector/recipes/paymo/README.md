# Paymo

International Paymo REST API recipe. Setup field is a Paymo API key from My Account (`https://app.paymoapp.com/#Paymo.module.myaccount/`). Auth is HTTP Basic with username `apiKey` and password `x` against `https://app.paymoapp.com/api`.

Operations are bounded reads: `healthcheck` (`GET /me`), `clients.list`, `projects.list`, and `tasks.list`. List operations optionally forward official `where`, `include`, and `partial_include` query parameters and omit them when unset. `page` / `pageSize` are not official or source list parameters. Provider next URLs are never followed. Writes, multipart logo uploads, and session-token auth are not exposed.

Adaptations: raw Paymo JSON is returned under `data` (`appcall-provider-json-v1`). The upstream OpenConnector handler unwraps `/me` into `{ user }` and is not preserved. Docs URL `https://github.com/paymoapp/api` redirects to `https://github.com/paymo-org/api`.

Pinned source: `oomol-lab/open-connector@33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus that source; live authentication remains unverified.
