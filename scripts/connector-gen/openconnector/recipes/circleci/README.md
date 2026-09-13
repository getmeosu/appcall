# CircleCI

Read-only international **CircleCI API v2** recipe for `circleci.com`. Create a personal API token at User Settings → Personal API Tokens and store it as `apiKey`. Requests send the `Circle-Token` header plus `Accept: application/json`. API v2 does not accept project tokens.

## Operations

- `healthcheck`: `GET /api/v2/me` (cheap authenticated profile read; same path as the pinned credential validator).
- `projects.get`: `GET /api/v2/project/{projectSlug}`.
- `pipelines.list`: `GET /api/v2/project/{projectSlug}/pipeline` with optional `branch` and `pageToken`.
- `pipelines.get`: `GET /api/v2/pipeline/{pipelineId}`.
- `workflows.list`: `GET /api/v2/pipeline/{pipelineId}/workflow` with optional `pageToken`.

`POST /project/{project-slug}/pipeline` (trigger) is omitted as a write. Insights, job, artifact, and env-var reads are omitted. CircleCI Server self-hosted hosts are omitted. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://circleci.com/api/v2` and `Circle-Token`. Official docs also document `Authorization: Bearer`; native keeps the pinned header. `projectSlug` is URL-encoded as one path segment (`gh/org/repo` → `gh%2Forg%2Frepo`), matching the pinned `encodeURIComponent`. Native category is `dev-tools`. Native omits the upstream user-agent.

The January 2023 production secret-exfiltration incident is historical and remediated; it is recorded under the 2026-09-13 waiver.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://circleci.com/docs/api/v2/. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure a personal API token, call `healthcheck` with `{}`, then `projects.get`.
