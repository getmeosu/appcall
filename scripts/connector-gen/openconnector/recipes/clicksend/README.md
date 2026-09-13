# ClickSend

Read-only ClickSend REST API v3 recipe. Configure the dashboard API username (non-secret) and API key (secret). The runner sends HTTP Basic authentication with username as the Basic username and the API key as the Basic password to `https://rest.clicksend.com/v3`, plus `Accept: application/json`.

Selected operations are `healthcheck` and `account.get` (`GET /account`), `lists.list` (`GET /lists` with optional `page` and `limit`), `lists.get` (`GET /lists/{list_id}`), and `contacts.list` (`GET /lists/{list_id}/contacts`). SMS send/price and contact mutations are omitted. `list_id` is a required positive integer and is URL-encoded as a path segment.

Adaptations versus the pinned OpenConnector source: native Basic auth uses `http.auth.basic` rather than a handwritten header; GET requests omit `Content-Type` because the source only sets it when a JSON body is present; the upstream user-agent is not sent; responses keep raw provider JSON under `data` instead of the source `responseCode`/`responseMessage` envelope.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.clicksend.com/docs and https://developers.clicksend.com/docs/rest/v3/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure both setup fields, call `healthcheck` with `{}`, then `lists.list`.
