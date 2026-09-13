# Feathery

Read-only Feathery REST recipe for the US-hosted forms API. Create an admin API key in Feathery developer settings. The runner sends `Authorization: Token <apiKey>` to `https://api.feathery.io`.

This recipe pins the documented US default host. Official regional hosts (`api-ca.feathery.io`, `api-eu.feathery.io`, `api-au.feathery.io`) are not caller-supplied and are not included.

Covered operations: credential-only `healthcheck` (`GET /api/account/`), `forms.list`, `forms.get`, `hidden-fields.list`, and `users.list`. Writes and user-session/field-data reads are omitted. `forms.get` uses official `GET /api/form/{form_id}/` rather than the pinned source `/schema/` suffix. User list admits optional `created_after` and `created_before`; paired `filter_field_id`/`filter_field_value` is omitted.

Official docs live at `https://api-docs.feathery.io/`. Host is `api.feathery.io`. Native category is `forms`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `forms.list`.
