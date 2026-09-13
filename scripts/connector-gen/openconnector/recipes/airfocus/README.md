# airfocus

Read-only international **airfocus REST API** recipe. Create a personal access token under Member settings → API keys and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://app.airfocus.com/api`.

## Operations

- `healthcheck`: `GET /profile` (cheap authenticated read; OpenAPI `retrieveProfile`).
- `workspaces.search`: `POST /workspaces/search` with optional JSON `archived`.
- `workspaces.get`: `GET /workspaces/{workspaceId}`.
- `items.get`: `GET /workspaces/{workspaceId}/items/{itemId}`.

Successful responses are raw provider JSON under AppCall `data`. Writes, item search POSTs, and workspace mutations are omitted.

## Adaptations

Pinned source and official OpenAPI agree on `https://app.airfocus.com/api` and Bearer PAT. Native category is `productivity`. Filter/sort search objects are omitted because they are provider-defined discriminators.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
