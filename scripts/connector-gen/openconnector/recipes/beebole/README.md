# Beebole

Read-only international **Beebole GraphQL API** recipe. Copy the API key from the initials menu → API Key (or Settings > API) and store it as `apiKey`. Requests send the `apikey` header and `Accept: application/json` to `https://app.beebole.com`.

## Operations

- `healthcheck`: `POST /graphql` with `{"query":"{ __typename }"}` (cheap authenticated read; pinned credential validator).
- `people.current`: `POST /graphql` with the official example `{ currentPerson { name email } }`.
- `graphql.execute`: `POST /graphql` with required `query` and optional `variables` / `operationName`.

Successful responses are raw GraphQL JSON under AppCall `data`. HTTP 200 envelopes with a populated `errors` array (including `APIKeyError:InvalidKey`) are demoted via `http.errors.bodyErrorPaths` `["errors"]`. The legacy JSON-RPC host `beebole-apps.com` is not this edition.

## Adaptations

Pinned source and official GraphQL docs agree on `POST https://app.beebole.com/graphql` and the `apikey` header. Native category is `productivity` (source Productivity/Developer Tools). Curated fixtures use read queries.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
