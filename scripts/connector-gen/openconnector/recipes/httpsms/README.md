# httpSMS

Read-only httpSMS REST API v1 recipe. Configure the dashboard API key from https://httpsms.com/settings. The runner sends `x-api-key` and `Accept: application/json` to `https://api.httpsms.com/v1`. Official OpenAPI spells the header `x-api-Key`; HTTP header names are case-insensitive.

This recipe is **HOLD**. Official privacy policy attributes the service to Ndole Studio without a registered-company country or address, so operator geography is unknown.

Selected operations are `healthcheck` and `users.me` (`GET /users/me`), `billing.usage.get` (`GET /billing/usage`), `phones.list` (`GET /phones` with optional `skip`, `limit` 1-20, and `query`), and `messages.get` (`GET /messages/{messageId}`). Send, delete, bulk, and thread mutations are omitted. Native returns the raw `{status, message, data}` envelope under `data` and does not strip `api_key` from the user object the way the pinned source does.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.httpsms.com/index.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
