# Buttondown

Read-only Buttondown REST recipe for the international API at `https://api.buttondown.com/v1`. Create an API key at API → Keys. The runner sends `Authorization: Token <apiKey>` and `Accept: application/json`.

Covered operations: credential-only `healthcheck` (`GET /v1/accounts/me`), `newsletters.list`, `subscribers.list`, `subscribers.get`, and `tags.list`. Subscriber and tag writes, deletes, and the pinned repeated `tag` query are omitted.

Official docs live at `https://docs.buttondown.com/api-authentication`. Native category is `email-marketing`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `newsletters.list`.
