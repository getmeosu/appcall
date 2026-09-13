# Memberstack

Read-only international Memberstack Admin REST API recipe. Configure a secret key (`sk_sb_…` test or `sk_…` live) from Dev Tools → Keys & IDs. The runner sends `x-api-key` to `admin.memberstack.com`.

Covered operations: credential-only `healthcheck` (`GET /members?limit=1`), `members.list`, and `members.get`. Member create/update/delete, free-plan mutation, and token verification are not exposed. Cursor pagination is caller-controlled. `members.get` accepts member ID or URL-encoded email; missing members remain HTTP 200 with `data: null`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.memberstack.com/admin-rest-api/quick-start. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the secret key, call `healthcheck` with `{}`, then `members.list`.
