# Felt

Read-only international Felt REST API v2 recipe. Configure an API token from the Developers tab of Felt Workspace Settings (`felt_pat_…`). The runner sends `Authorization: Bearer` to `felt.com`.

Covered operations: credential-only `healthcheck` (`GET /api/v2/user`), `projects.list`, `projects.get`, and `maps.get`. Optional `workspace_id` on project list is caller-controlled. Map/project writes, duplicates, moves, and deletes are not exposed.

Native category is `productivity` (source Developer Tools/Productivity).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Live smoke is unverified; fixtures only.
