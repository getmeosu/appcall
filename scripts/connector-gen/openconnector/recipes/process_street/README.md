# Process Street

Read-only international Process Street Public API v1.1 recipe. Configure an API key from organization settings / Integrations in the Process Street app. Requests send `X-API-Key` and `Accept: application/json` to `https://public-api.process.st/api/v1.1`.

Covered operations: credential-only `healthcheck` (`GET /workflows`), `workflows.list`, `workflows.get`, `workflow-runs.list`, and `workflow-runs.get`. Optional `name` and `cursor` bind to official `name` and `_` query parameters. Optional `status` is a comma-separated string. Provider `links[].href` next URLs are never followed. Writes, form-field mutation, and multipart uploads are omitted.

Adaptations: official docs title the header `X-API-KEY`; native and pinned source send `X-API-Key`. Raw Process Street JSON is returned under `data` (`appcall-provider-json-v1`). Native category is `productivity`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://public-api.process.st/api/v1.1/docs/index.html. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
