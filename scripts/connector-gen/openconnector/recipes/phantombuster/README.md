# PhantomBuster

Read-only international PhantomBuster API v2 recipe (Paris-based cloud automation at phantombuster.com). Configure an API key from Workspace settings → Technical → API keys. The runner sends `X-Phantombuster-Key` plus `Accept: application/json` to `https://api.phantombuster.com/api/v2`. The v1 `X-Phantombuster-Key-1` header on `phantombuster.com` is a different edition and will not work here.

## Operations

- `healthcheck`: `GET /orgs/fetch` with empty input (pinned credential validator).
- `agents.list`: `GET /agents/fetch-all`.
- `agent.get`: `GET /agents/fetch` with required `id`.
- `containers.list`: `GET /containers/fetch-all` with required `agentId`.
- `container.get`: `GET /containers/fetch` with required `id`.

Agent launch/stop writes and optional container filters (`endedBefore`, `amount`, `mode`, `runtimeEvents`) are omitted. Native returns raw PhantomBuster JSON under `data`.

## Adaptations

Pinned source and official v2 reference agree on `https://api.phantombuster.com/api/v2` and `X-Phantombuster-Key`. Native category is `dev-tools` (source Developer Tools/Data maps here). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://hub.phantombuster.com/docs/api and https://hub.phantombuster.com/reference/get_orgs-fetch. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
