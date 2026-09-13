# Clerk

Read-only international Clerk Backend API recipe. Configure a Clerk Dashboard secret key (`sk_test_…` or `sk_live_…`). The runner sends `Authorization: Bearer` to `api.clerk.com`.

Covered operations: credential-only `healthcheck` (`GET /v1/instance`), `users.list`, `users.count`, and `users.get`. Pagination and query strings are caller-controlled. Array identity filters, user writes, bans, and metadata mutation are not exposed.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
