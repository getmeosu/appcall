# PostGrid

Read-only PostGrid Print & Mail API v1 recipe. Configure a test or live Print & Mail API key from the PostGrid dashboard settings. The runner sends `x-api-key` plus `Accept: application/json` to `https://api.postgrid.com/print-mail/v1`. This recipe is not the Address Verification API (`/v1/addver`).

Selected operations are `healthcheck` (`GET /templates?limit=1`), `contacts.list` (`GET /contacts` with optional `skip`/`limit`), `contacts.get` (`GET /contacts/{id}`), `templates.list` (`GET /templates` with optional `skip`/`limit`), and `templates.get` (`GET /templates/{id}`). Contact/template create/update/delete, letter/postcard/cheque sends, and the unstructured `search` query are omitted so list is not used as a billable search. Healthcheck is a cheap template list, matching the pinned credential validator.

Adaptations versus the pinned OpenConnector source: native header auth uses `http.auth` rather than `-u API_KEY:`; the upstream user-agent is not sent; GET requests omit `Content-Type` because the source only sets it when a JSON body is present; responses keep raw PostGrid JSON under `data`. Path IDs are URL-encoded.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.postgrid.com/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `templates.list`.
