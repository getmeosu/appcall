# Chorus

Read-only international Chorus conversation intelligence API recipe (ZoomInfo). Generate an API token from Personal Settings after the Chorus role has API access. The runner sends the raw token in `Authorization` (not Bearer) to `https://chorus.ai` with `Accept: application/vnd.api+json`.

Covered operations: credential-only `healthcheck` (`GET /api/v1/users/me`), `teams.list`, `teams.get`, and `scorecards.list`. Engagements, conversations, and writes are omitted. Scorecard recipient/reviewer/initiative filters are omitted; optional `pageSize` / `pageNumber` bind to `page[size]` / `page[number]`.

Adaptations versus the pinned OpenConnector source: native category is `crm` rather than Communication/Data; responses are raw Chorus JSON:API under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api-docs.chorus.ai/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
