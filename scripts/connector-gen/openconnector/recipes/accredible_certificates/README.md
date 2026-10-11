# Accredible

International Accredible Credential API recipe covering origin healthcheck plus every Composio `ACCREDIBLE_CERTIFICATES_*` HTTP tool (36 tools, 39 operations including origin `healthcheck`, `groups.list`, and `credentials.list`).

## Setup

Copy an API key from the Accredible dashboard (API Management). The runner sends `Authorization: Token token=<key>` and `Accept: application/json` to `https://api.accredible.com`.

## Operations

- Origin reads: `healthcheck` and `issuer.get` (`GET /v1/issuer/details`), `groups.list` / `groups.get`, `credentials.list` / `credentials.get`.
- Credentials: create, update, delete, v2 bulk create, v2 search, generate PDFs, analytics.
- Groups: create, update, delete, clone, search.
- Evidence items and references nested under a credential.
- Collections, departments, designs/templates, attribute keys, skill categories.
- Embedded badge and certificate designer initialize.

Credential and group writes wrap JSON as `{ credential: ... }` / `{ group: ... }` per the official OpenAPI. Collection create uses `{ collection: ... }`; attribute-key create uses `{ attribute_key: ... }`. Search POSTs send documented query objects (v2 credential search supports `field[op]` keys). Mixed group/bulk writes accept HTTP 207. Successful JSON responses are raw provider JSON under AppCall `data`.

EU host `eu.api.accredible.com` and sandbox `sandbox.api.accredible.com` are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.api.accredible.com/. Live authentication is unverified.
