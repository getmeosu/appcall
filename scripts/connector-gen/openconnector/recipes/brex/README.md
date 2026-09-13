# Brex

Read-only Brex Team and Transactions API recipe for first-party dashboard user tokens. Create a token under Developer > Settings in the Brex dashboard. The runner sends `Authorization: Bearer <token>` to `https://api.brex.com`.

Official docs distinguish user tokens (own-account access) from partner OAuth. This recipe uses the documented user-token Bearer header; it does not invent an API-key mapping and does not implement the OAuth authorization-code flow.

Covered operations: credential-only `healthcheck` (`GET /v2/users/me`), `company.get`, `users.list`, and `cardAccounts.list`. Expenses, budgets, and card transactions are omitted. User list admits optional `cursor`, `limit`, `email`, and `remoteDisplayId`; source `expand[]` is omitted.

Native category is `banking-data` (corporate card and company reads). Source category Finance is not in the native allowlist.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the user token, call `healthcheck` with `{}`, then `company.get`.
