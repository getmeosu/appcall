# Close

Read-only international Close CRM REST API recipe for Elastic, Inc. (Close). Create an API key under Settings → Developer → API Keys. The runner sends HTTP Basic `apiKey:` (empty password) and `Accept: application/json` to `https://api.close.com/api/v1`.

Covered operations: credential-only `healthcheck` (`GET /me/`), `leads.list` (`GET /lead/` with optional `_limit` 1–100 and `_skip`), `leads.get` (`GET /lead/{leadId}/`), `contacts.list` (`GET /contact/` with optional `_limit`, `_skip`, `lead_id`), and `contacts.get` (`GET /contact/{contactId}/`). Lead/contact/task/opportunity writes are omitted. `_fields` from `includeFields` is omitted because native cannot compute a comma-joined query value.

Native category is `crm` (source Productivity/Marketing). Native Basic uses `http.auth.basic` rather than a handwritten header. Trailing slashes on Close collection and member paths are retained. The upstream user-agent is not sent. Responses keep raw Close JSON under `data`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.close.com/api/overview/api-key-authentication and https://developer.close.com/resources/leads. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `leads.list`.
