# CallerAPI

Read-only international **CallerAPI** recipe. Copy an API key from the CallerAPI dashboard and store it as `apiKey`. Requests send `x-auth: <key>` and `Accept: application/json` to `https://api.callerapi.com`.

## Operations

- `healthcheck`: `GET /api/me` with empty input (cheap authenticated email/credit read; pinned credential validator). Not a billed phone lookup.
- `account.get`: `GET /api/me`.
- `phones.get`: `GET /api/lookup/{phone}` with required `phone` and optional `hlr`. This lookup consumes credits.

Successful responses are raw provider JSON under AppCall `data`. HTTP 200 bodies with a non-empty `error` string are demoted via `http.errors.bodyErrorPaths`. Picture lookup is omitted.

## Adaptations

Official quickstart curl examples call `https://callerapi.com/api/me`; docs also name `api.callerapi.com` as automatic geo steering. Native pins `api.callerapi.com` to match the pinned OpenConnector runtime. Native omits `hlr` when unset; pinned runtime always sends `hlr=true` or `hlr=false`. Native category is `utility` (source Communication/Security are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent. `status` is not a bodyErrorPath because success `status` is the non-empty string `success`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
