# Modjo

Read-only Modjo Public API v2 recipe for the international product at `api.modjo.ai`. Configure an API key from Modjo settings as described in the Public API docs. The runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v2/users?size=1`), `users.list`, `users.get`, `teams.list`, and `accounts.list`. Call transcripts, summaries, next steps, and deal AI summaries are omitted. `users.get` requires a positive integer `id`.

Modjo wraps actions in `defineModjoAction`, so catalog admission uses a reviewed-action-ids row rather than static `defineProviderAction` extraction.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.modjo.ai/v2/docs. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `users.list`.
