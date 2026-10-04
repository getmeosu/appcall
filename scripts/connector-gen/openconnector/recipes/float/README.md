# Float

International **Float API v3** recipe at version 0.2.0. Configure a Bearer token from Float Account Settings > Integrations. Store it as `apiKey`. Requests send `Authorization: Bearer <apiKey>` and `Accept: application/json` to `https://api.float.com/v3`.

## Operations

`healthcheck` remains `GET /accounts?per-page=1`. HTTP actions cover accounts, people, clients, projects, allocations (`/tasks`), time off, departments, and milestones. Writes include create/update for people, clients, projects, allocations, and time off, plus allocation delete.

Float's scheduling API does not publish vendor webhooks; this recipe is HTTP-only.

Successful list/get responses are raw provider JSON under AppCall `data`. Delete returns `{deleted, id}`.

## Adaptations

Native category is `scheduling`. Pagination query names `page` and `per-page` match the official API. The upstream user-agent is not sent. Custom result mapping from 0.1.0 is replaced with standard `data` wrapping.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developer.float.com/api_reference.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
