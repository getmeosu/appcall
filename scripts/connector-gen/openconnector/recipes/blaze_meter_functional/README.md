# BlazeMeter Functional

Read-only international **BlazeMeter Functional** API v4 recipe for `a.blazemeter.com`. Create an API key under BlazeMeter Settings → API keys. Store the key ID as `apiKeyId` and the secret as `apiKey`. The runner sends HTTP Basic authentication (key ID as username, secret as password) plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /user/active-sessions` (cheap authenticated read; pinned functional runtime has no `GET /user` action).
- `multi-tests.list`: `GET /multi-tests` with required `workspaceId` and optional `projectId`, `skip`, `limit`. Native also sends static `platform=functional`.
- `multi-tests.get`: `GET /multi-tests/{collectionId}` with required `collectionId` and optional `populateTests`.

Writes (create/start/delete suites) are omitted.

## Adaptations

Official functional list sample misspells `/mulit-tests`; native uses the documented explorer path `/multi-tests`. Official functional docs require `platform=functional`; native sends that static query. Official public docs emphasize `GET /user` for API-key validation; healthcheck follows the pinned functional handler `GET /user/active-sessions`. Native category is `dev-tools` (source Developer Tools). Native omits the upstream user-agent. HTTP 200 envelopes use `bodyErrorPaths: ["error"]` because success sets `error` to `null`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://help.blazemeter.com/apidocs/functional/introduction_authorization.htm. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure `apiKeyId` and `apiKey`, call `healthcheck` with `{}`, then `multi-tests.list` with a workspace ID. Historical non-China records (Jenkins plugin CVE-2025-13472; Perforce Helix Core insecure defaults) are kept under the 2026-09-13 waiver.
