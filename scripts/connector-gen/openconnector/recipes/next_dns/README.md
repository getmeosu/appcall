# NextDNS

Read-only NextDNS management API recipe. Configure an API key from the NextDNS account page and send it as `X-Api-Key` to `https://api.nextdns.io`. Native GET reads send `Accept: application/json` and omit the pinned helper's `user-agent`.

Covered operations: credential-only `healthcheck` (`GET /profiles`), `profiles.list`, `profiles.get`, `logs.list`, and `analytics.status`. Writes, denylist mutations, and remaining analytics families are omitted. Official HTTP 200 `{errors:[...]}` user errors are demoted via `bodyErrorPaths`. Native returns raw NextDNS JSON under `data`. Native category is `utility` (source Security/Data are not both in native CATEGORIES).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://nextdns.github.io/api/. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
