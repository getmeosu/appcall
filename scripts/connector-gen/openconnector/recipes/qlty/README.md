# Qlty

Read-only international Qlty Cloud REST API recipe. Generate a personal access token at https://qlty.sh/user/settings/tokens. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://api.qlty.sh`.

Covered operations: credential-only `healthcheck` (`GET /user`), `workspaces.list`, `workspaces.get`, `projects.list`, and `rate-limit.get`. Optional `limit` / `offset` bind to official `page[limit]` (1–100) and `page[offset]`. Workspace and owner keys must be at least 3 characters. `GET /gh/{owner}/projects` is the official GitHub-scoped list path. Writes, issue filters, NDJSON/CSV Accept variants, and metric series are omitted. Provider `meta.hasMore` is metadata only.

Adaptations: official host `https://api.qlty.sh` matches pinned source (CLI coverage uploads may use `qlty.sh/api`; that is a different product surface). Native category is `dev-tools` (source Data is not in the Rust CATEGORIES allowlist). Raw Qlty JSON is returned under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.qlty.sh/api/introduction. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
