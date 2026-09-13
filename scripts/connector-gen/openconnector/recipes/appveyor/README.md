# AppVeyor

Read-only AppVeyor REST API recipe for the hosted international product at `ci.appveyor.com`. Configure an account-level API token from https://ci.appveyor.com/api-keys; the runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /api/projects`), `projects.list`, `environments.list`, `users.list`, and `roles.list`. User-level tokens that require `/api/account/{accountName}` are omitted because that computed path prefix is not the Algolia bounded-wildcard + required stored id host pattern. `get_role` and `get_build_artifacts` are omitted. Native returns raw JSON under `data` rather than the upstream `{projects,count}` wrappers.

Native category is `dev-tools` (source Developer Tools). Operator: Appveyor Systems Inc., Vancouver, British Columbia, Canada.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.appveyor.com/docs/api/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure an account-level token, call `healthcheck` with `{}`, then `projects.list`.
