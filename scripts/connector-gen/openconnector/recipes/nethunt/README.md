# NetHunt

Read-only NetHunt Integration API recipe for NetHunt CRM (Ukrainian vendor with US registered office in Middletown, Delaware). Configure the account email plus API key from Settings > Apps and other integrations. The runner sends HTTP Basic (`email:apiKey`) and `Accept: application/json` to `https://nethunt.com/api/v1/zapier`.

Selected operations are `healthcheck` (`GET /triggers/auth-test`), `folders.readable.list` (`GET /triggers/readable-folder`), `folders.writable.list` (`GET /triggers/writable-folder`), `folder.fields.list` (`GET /triggers/folder-field/{folderId}`), and `records.new.list` (`GET /triggers/new-record/{folderId}` with optional `since` and `limit`). Healthcheck uses the documented credential probe. Record create/update/delete, comments, call logs, and advanced search are omitted.

Adaptations versus the pinned OpenConnector source: native returns the raw Integration API JSON under `data` instead of wrapping arrays as `{user}`/`{folders}`/`{fields}`/`{records}` or taking `payload[0]` from auth-test; native category is `crm` (source Productivity/Marketing); the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://nethunt.com/integration-api. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure email and API key, call `healthcheck` with `{}`, then `folders.readable.list`.
