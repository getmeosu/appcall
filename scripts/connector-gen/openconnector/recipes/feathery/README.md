# Feathery

Feathery REST recipe for the US-hosted forms API (v0.2.0). Create an admin API key in Feathery developer settings. The runner sends `Authorization: Token <apiKey>` to `https://api.feathery.io`.

Covered HTTP operations: `healthcheck`, form list/get/create/update/delete/copy, submissions list/create, user list/create/delete/session/events/data, hidden-field list/create, workspaces, extractions, and document templates. EventOnly webhooks: `webhook.form_completion`, `webhook.data_received`.

Official docs live at `https://api-docs.feathery.io/`. Host is `api.feathery.io`. Native category is `forms`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Fixtures are independently derived from official docs plus pinned source and do not represent live provider access.
