# eSignatures.com

Read-only international **eSignatures.com REST API** recipe (pinned upstream id `esignatures_io`). Find the Secret Token on the API page after signing in. Store it as `apiKey`. The runner sends HTTP Basic authentication with the token as username and an empty password to `https://esignatures.com/api`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /templates` with empty input (cheap authenticated template list; pinned credential validator).
- `templates.list`: `GET /templates`.
- `templates.get`: `GET /templates/{templateId}`; `templateId` is a required non-empty string.
- `templates.content.get`: `GET /templates/{templateId}/content`.
- `contracts.get`: `GET /contracts/{contractId}`; `contractId` is a required non-empty string. Official docs warn against polling this path.

Successful responses are raw provider JSON under AppCall `data`. Contract/template writes, withdraw, and the optional `token` query credential are omitted.

## Adaptations

Pinned source and official docs agree on `https://esignatures.com/api` and Basic auth with an empty password. Native Basic uses `http.auth.basic` rather than a handwritten header. Native category is `productivity` (no documents/legal CATEGORIES value). The product currently brands as eSignatures.com; `esignatures.io` is the historical/upstream id. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
