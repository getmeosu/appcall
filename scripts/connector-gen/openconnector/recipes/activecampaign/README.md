# ActiveCampaign

**HOLD.** Official international ActiveCampaign API v3 recipe. Configure an API token from Settings > Developer. The runner would send `Api-Token` plus `Accept: application/json`.

Official docs require the full API URL from the Developer tab and explicitly do not guarantee `api-us1.com` for all users, especially outside the United States. The pinned OpenConnector connector accepts any HTTPS `apiUrl`. EU and APAC data centers exist; the hostname suffix set is not a documented closed Algolia/Grafana stored-id + bounded-wildcard pattern. `boundedNetwork` remains unproven, so selection is HOLD.

Native interpolates `https://{{account}}.api-us1.com` with `allowedHosts` `*.api-us1.com` only so the recipe has a shape; it is not an admitted product host.

Covered operations (not admitted): `healthcheck` (`GET /api/3/users/me`, cheap current-user read), `contacts.list`, `contacts.get`, `lists.list`, `fields.list`. Contact sync writes are omitted.

Historical 2022 support-chat social-engineering contact-list exports and the 2024 Dropbox Sign third-party notice are recorded; they do not disqualify under the 2026-09-13 waiver. The HOLD is the caller-supplied host.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developers.activecampaign.com/reference/url. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
