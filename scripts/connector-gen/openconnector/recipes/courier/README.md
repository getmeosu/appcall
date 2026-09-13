# Courier

Read-only international Courier notification API recipe. Configure a workspace API key from Settings → API Keys. The runner sends `Authorization: Bearer` to `api.courier.com`.

Covered operations: credential-only `healthcheck` (`GET /lists`), `lists.list`, `lists.get`, `profiles.get`, and `listSubscriptions.list`. Cursor pagination is caller-controlled and never followed automatically. Sends, profile merges, list mutation, and subscriber writes are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
