# API.Bible

Read-only API.Bible Scripture API recipe covering origin healthcheck plus every Composio `API_BIBLE_*` HTTP tool (19 tools, 20 operations; healthcheck is an authenticated `GET /v1/bibles` probe and is not a Composio slug).

Configure an API key from the API.Bible credentials page; the runner sends it as the official `api-key` header to `https://api.scripture.api.bible`.

## Operations

- Auth: `healthcheck` (`GET /v1/bibles`).
- Text Bibles: `bibles.list` (`API_BIBLE_GET_SUPPORTED_VERSIONS`), `bibles.get`, `bibles.search`.
- Books: `books.list` (`API_BIBLE_GET_ALL_BOOKS`), `books.get`, `books.sections.list` (`API_BIBLE_GET_SECTIONS`).
- Chapters: `chapters.list`, `chapters.get`, `chapters.sections.list`.
- Verses / passages / sections: `verses.list`, `verses.get`, `passages.get`, `sections.get`.
- Audio: `audioBibles.list`, `audioBibles.get`, `audioBibles.books.list`, `audioBibles.books.get`, `audioBibles.chapters.list`, `audioBibles.chapters.get`.

Successful JSON responses are raw API.Bible JSON under AppCall `data`. `verses.list` returns verse identifiers, not verse text. Composio `include_full_details` / `include_chapters` map to official hyphenated query names (`include-full-details`, `include-chapters`). Composio search `bible_id` is `bibleId`. Pinned host is `api.scripture.api.bible`; current docs also document `rest.api.bible` as a future migration target that still uses the same `api-key` header.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.api.bible/getting-started/authentication/. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `bibles.list`.
