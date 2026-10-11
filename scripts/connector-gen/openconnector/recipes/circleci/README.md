# CircleCI

International **CircleCI API v2** recipe for `circleci.com`, plus GraphQL-unstable orb/context mutations and the self-hosted runner API at `runner.circleci.com`. Create a personal API token at User Settings → Personal API Tokens and store it as `apiKey`. Requests send the `Circle-Token` header plus `Accept: application/json`. API v2 does not accept project tokens.

## Operations

Runner operations match this recipe one-for-one (66 operations): the original healthcheck / project / pipeline reads, plus the remaining Composio CIRCLECI tools.

- REST v2 lives at `https://circleci.com/api/v2`.
- GraphQL tools POST to `https://circleci.com/graphql-unstable`.
- Self-hosted runners use `GET https://runner.circleci.com/api/v3/runner`.

`projectSlug` is URL-encoded as one path segment (`gh/org/repo` → `gh%2Forg%2Frepo`).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://circleci.com/docs/api/v2/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified. The January 2023 production secret-exfiltration incident is historical and remediated under the 2026-09-13 waiver.
