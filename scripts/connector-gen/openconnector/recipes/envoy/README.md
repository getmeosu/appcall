# Envoy

Read-only international Envoy Workplace Visitors API recipe (the visitor-management SaaS at envoy.com, not Envoy Proxy). Configure a private-app Client API Key from the Envoy Dev Dashboard. The runner sends `X-API-Key` to `api.envoy.com`.

Covered operations: credential-only `healthcheck` (`GET /rest/v1/locations`), `locations.list`, `locations.get`, `invites.list`, and `invites.get`. Pagination and scalar invite filters are caller-controlled. Array `ids`/`locationIds` filters, employee directory reads, flows, and writes are not exposed.

Native category is `productivity` (source Productivity/Security; Rust CATEGORIES has no security bucket).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
