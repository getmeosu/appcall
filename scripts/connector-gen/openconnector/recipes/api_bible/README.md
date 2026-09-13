# API.Bible

Read-only API.Bible Scripture API recipe. Configure an API key from the API.Bible credentials page; the runner sends it as the official `api-key` header to `https://api.scripture.api.bible`.

Covered operations: credential-only `healthcheck` (`GET /v1/bibles`), `bibles.list`, `books.list`, `chapters.list`, and `verses.list`. Scripture search and chapter/verse/passage content retrieval are omitted. `verses.list` returns verse identifiers, not verse text.

The native key is `api-bible` while the upstream directory is `api_bible`. Pinned host is `api.scripture.api.bible`; current docs also document `rest.api.bible` as a future migration target that still uses the same `api-key` header.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.api.bible/getting-started/authentication/. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `bibles.list`.
