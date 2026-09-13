# APIVoid

Read-only international APIVoid v2 recipe. Configure the dashboard API key from https://dash.apivoid.com. The runner sends `X-API-Key`, `Accept: application/json`, and `Content-Type: application/json` to `https://api.apivoid.com`.

Healthcheck is `POST /v2/account-info`, the documented Account Info API that consumes no credits. Official account-info curl omits a JSON body; native sends `{}` to match the pinned source. Reputation and email lookups consume credits and are not used as healthcheck.

Operations: `healthcheck`, `account.info`, `ip.reputation`, `domain.reputation`, and `emails.verify`. Email verify requires `email`; the pinned email-or-domain XOR and URL reputation are omitted. Successful responses are HTTP 200 JSON; failures are non-200 `{error}` bodies.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs and the pinned source and do not represent live provider access. Live authentication is unverified.
