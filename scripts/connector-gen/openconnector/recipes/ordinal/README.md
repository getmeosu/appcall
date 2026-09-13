# Ordinal

Read-only international Ordinal workspace REST API v1 recipe. Create a workspace API key from https://app.tryordinal.com/settings/integrations/api (Pro plan or higher). The runner sends `Authorization: Bearer` to `https://app.tryordinal.com/api/v1`.

Covered operations: credential-only `healthcheck` (`GET /workspace`), `users.list`, `labels.list`, `posts.list`, and `posts.get`. Writes, ideas mutations, and array id filters are omitted.

Adaptations versus the pinned OpenConnector source: native GET sends `Accept` only (source also sets `content-type: application/json` on GET); responses are raw provider JSON under `data`; `users.list` preserves the official JSON array; the upstream user-agent is not sent. Native category is `social`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.tryordinal.com/api/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
