# Missive

Read-only Missive REST API recipe for the international product at `public.missiveapp.com`. Configure a personal API token from Missive Preferences → API (Productive plan). The runner sends `Authorization: Bearer`.

Covered operations: credential-only `healthcheck` (`GET /v1/users`), `users.list`, `organizations.list`, `teams.list`, `contact_books.list`, and `contacts.list`. Drafts, posts, conversation writes, and mailbox-filtered conversation lists are omitted. `users.list` and `teams.list` send no query because the pinned handlers do not; official docs also accept organization/limit/offset on those routes. `contacts.list` requires `contact_book`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://missiveapp.com/docs/developers/rest-api. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified: configure the API token, call `healthcheck` with `{}`, then `users.list`.
