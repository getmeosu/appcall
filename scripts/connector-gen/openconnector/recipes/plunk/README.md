# Plunk

Read-only international Plunk hosted API recipe pinned to `next-api.useplunk.com`. Configure a secret API key (`sk_…`) from the Plunk project under Settings > API Keys. The runner sends `Authorization: Bearer` to `https://next-api.useplunk.com`. Public keys (`pk_…`) cannot list or get contacts.

Covered operations: credential-only `healthcheck` (`GET /contacts?limit=1`), `contacts.list`, and `contacts.get`. Cursor pagination is caller-controlled. Send, track, verify, and contact mutation are not exposed. Self-hosted Plunk (caller-supplied Docker host) is not this edition.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://docs.useplunk.com/guides/api-keys and https://docs.useplunk.com/api-reference/contacts/listContacts. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the secret key, call `healthcheck` with `{}`, then `contacts.list`.
