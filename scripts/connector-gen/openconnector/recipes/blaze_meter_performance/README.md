# BlazeMeter Performance

Read-only international **BlazeMeter Performance** API v4 recipe for `a.blazemeter.com`. Create an API key under BlazeMeter Settings → API keys. Store the key ID as `apiKeyId` and the secret as `apiKey`. The runner sends HTTP Basic authentication (key ID as username, secret as password) plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /user` (cheap authenticated profile read; the pinned credential validator).
- `accounts.list`: `GET /accounts` with optional `skip` and `limit`.
- `workspaces.list`: `GET /workspaces` with required `accountId` and optional `enabled` / `textFilter`.
- `projects.list`: `GET /projects` with required `workspaceId` and optional `skip` / `limit`.
- `tests.get`: `GET /tests/{testId}` with required `testId`.

Starting a test and `list_tests` (workspace-or-project `anyOf` plus `sort` arrays) are omitted. `sort` array query params are omitted.

## Adaptations

Pinned source and official docs agree on `https://a.blazemeter.com/api/v4` and Basic Auth. Native category is `dev-tools` (source Developer Tools). Native omits the upstream user-agent. HTTP 200 envelopes use `bodyErrorPaths: ["error"]` because success sets `error` to `null`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://help.blazemeter.com/apidocs/functional/introduction_authorization.htm. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure `apiKeyId` and `apiKey`, call `healthcheck` with `{}`, then `accounts.list`. Historical non-China records (Jenkins plugin CVE-2025-13472; Perforce Helix Core insecure defaults) are kept under the 2026-09-13 waiver.
