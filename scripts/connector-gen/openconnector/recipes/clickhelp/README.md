# ClickHelp

Read-only international **ClickHelp hosted REST v2** recipe. Generate an API key from My Profile (Contributors only; REST API add-on required) and store it as `apiKey` with the contributor `login` and hosted portal name as `portal` (the `{name}` in `{name}.clickhelp.co`). Requests send HTTP Basic (`login:apiKey`) to `https://<portal>.clickhelp.co/api/v2`. Rate limits: 10 read requests/second. Custom-domain portal hosts and caller-supplied `portalUrl` values are not admitted.

## Operations

- `healthcheck`: `GET /users/{login}` (cheap authenticated profile read; pinned validator).
- `projects.list`: `GET /projects` with optional `type` (`Project`|`Publication`, sent as `types`) and `parentId`.
- `projects.get`: `GET /projects/{projectId}`.
- `topics.list`: `GET /projects/{projectId}/articles` with optional `query` (`q`), `returnSnippets` (`isReturnSnippets`), `count`, and `format`.
- `topics.get`: `GET /projects/{projectId}/articles/{topicId}` with optional `format`.

Successful responses are raw ClickHelp JSON under AppCall `data` (arrays for list operations). Topic create/update, portal search, storage, and workflow writes are omitted.

## Adaptations

Pinned source accepted any HTTPS `portalUrl`. Native pins hosted `*.clickhelp.co` via required stored `portal` (Algolia/Grafana-style). Native category is `productivity`. HTTP Basic uses `login` as username and `apiKey` as password. Native omits `Content-Type` on GET. Native returns raw JSON under `data` instead of the pinned `{projects}` / `{topic}` wrappers. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.clickhelp.com/articles/clickhelp-user-manual/clickhelp-api. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
