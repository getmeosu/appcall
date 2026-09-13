# Cal.com

**HOLD.** Official international Cal.com Cloud API v2 at `https://api.cal.com` (Cal.com, Inc., San Francisco). Pinned OpenConnector is OAuth2-only (`https://app.cal.com/auth/oauth2/authorize` and `https://api.cal.com/v2/auth/oauth2/token` with JSON `client_secret_post`). Native recipe auth cannot express `authorizeUrl` / `tokenUrl`. Official API keys exist but are not a pinned authType and are not invented.

The pinned host is fixed `api.cal.com`, not a caller-supplied self-hosted base URL, so the Algolia bounded-wildcard HOLD does not apply.

Covered operations (not admitted): `healthcheck` (`GET /v2/me` with `cal-api-version: 2024-08-13`), `event-types.list`, `bookings.list`, and `schedules.list`. Writes and compatibility aliases are omitted.

Gecko Security January 2026 account-takeover/IDOR findings were patched in v6.0.8 and are recorded as a historical non-China incident.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://cal.com/docs/api-reference/v2/oauth. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
