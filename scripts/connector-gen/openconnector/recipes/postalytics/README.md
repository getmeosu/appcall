# Postalytics

Read-only Postalytics REST API v1 recipe. Configure the API key from the Connect section of the Postalytics account. The runner sends HTTP Basic authentication with the API key as the username and a blank password to `https://api.postalytics.com/api/v1`, plus `Accept: application/json`.

Selected operations are `healthcheck` (`GET /account/me`), `campaigns.list` (`GET /campaigns`), `contact_lists.list` (`GET /contacts`), `contacts.list` (`GET /contacts/{contactListId}` with optional `limit` 1–100 and `start`), and `templates.list` (`GET /templates`). Campaign/contact/template writes and `POST /send` are omitted. Production host only; `api-dev.postalytics.com` is omitted.

Adaptations versus the pinned OpenConnector source: native Basic auth uses `http.auth.basic` with an empty password template; the upstream user-agent is not sent; healthcheck maps to `GET /account/me` from the credential validator rather than `list_campaigns`; list payloads are raw JSON arrays under `data`. `contactListId` is URL-encoded as a path segment.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.postalytics.com/getting-started/authentication-0 and https://docs.postalytics.com/references/postalytics-rest-api/get-my-account. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure the API key, call `healthcheck` with `{}`, then `campaigns.list`.
