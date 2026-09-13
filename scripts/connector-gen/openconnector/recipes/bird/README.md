# Bird

Read-only Bird (formerly MessageBird) REST API recipe at `https://api.bird.com`. Configure a workspace or organization access key from Bird security settings. The runner sends `Authorization: AccessKey {key}`.

Healthcheck is the pinned credential validator `GET /workspaces?limit=1` (cheap authenticated read). Covered operations: `channels.list`, `channels.get`, `messages.get`, `contacts.list`, `contacts.get`. Writes (send message, create/update/delete contact) and identifier search are omitted.

Official Accounts API documents `GET /organizations/{organizationId}/workspaces`; this recipe follows the pinned validator `GET /workspaces` so healthcheck does not require a caller-supplied organization id. Native category is `messaging` (source Communication/Marketing are not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.bird.com/api/api-access/api-authorization. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified.
