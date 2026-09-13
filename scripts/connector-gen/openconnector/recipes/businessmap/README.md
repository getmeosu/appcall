# Businessmap

Read-only international **Businessmap REST API v2** recipe for Businessmap OOD (Bulgaria; formerly Kanbanize). Configure the API key from My Account > API and the account subdomain (the first label of `https://{subdomain}.kanbanize.com`). Requests send the `apikey` header to `https://{{account}}.kanbanize.com/api/v2`.

Covered operations: credential-only `healthcheck` (`GET /workspaces`), `workspaces.list`, `boards.list`, `boards.get`, and `cards.get`. Writes and comma-joined array filters are omitted. Scalar filters `type`, `is_archived`, and `if_assigned` are admitted where documented.

Host admission uses the Algolia pattern: required stored `account` subdomain plus `allowedHosts: ["*.kanbanize.com"]`. Native category is `productivity`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure `apiKey` and `account`, call `healthcheck` with `{}`, then `boards.list`.
