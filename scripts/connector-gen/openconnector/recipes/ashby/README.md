# Ashby

Read-only international Ashby ATS API recipe. Create an API key in Ashby Admin > Integrations > API Keys. The runner sends HTTP Basic Auth with the API key as username and an empty password, `Accept: application/json; version=1`, and `Content-Type: application/json` to `https://api.ashbyhq.com`.

## Operations

- `healthcheck`: `POST /apiKey.info` with empty JSON body (pinned credential validator).
- `jobs.list`: `POST /job.list` with optional `limit` (1-100) and `cursor`.
- `candidates.list`: `POST /candidate.list` with optional `limit` (1-100) and `cursor`.

Writes, `candidate.search` (`anyOf` email/name), and job status/expand filters are omitted. Native returns raw Ashby JSON under `data`. HTTP 200 bodies with an `errorInfo` object fail via `bodyErrorPaths`.

## Adaptations

Pinned source and official docs agree on `https://api.ashbyhq.com`, Basic `-u API_KEY:`, and RPC POST paths. Native Basic uses `http.auth.basic` rather than a handwritten header. Native category is `ats-recruitment` (source Productivity/Data). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.ashbyhq.com/docs/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
