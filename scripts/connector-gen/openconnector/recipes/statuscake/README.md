# StatusCake

Curated read-only recipe for the international StatusCake API (pinned Open Connector source revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`).

Setup requires a StatusCake API token. The runner sends `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.statuscake.com/v1`.

Operations are `healthcheck`, `uptimeTests.list`, `uptimeTests.get`, and `uptimeLocations.list`. The healthcheck accepts `{}` and makes the bounded request `GET /uptime?limit=1`. `uptimeTests.list` accepts optional `page` (minimum 1) and `limit` (1–100); callers request later pages explicitly. Provider `next` links are returned as data where present and are never followed automatically. `uptimeTests.get` requires `test_id`; IDs are encoded as one URL path segment. Locations are a fixed read-only list.

Fixtures cover successful envelopes, two distinct numeric test IDs, unauthorized responses, missing required input, Accept and Authorization headers, realistic provider objects, and pagination metadata. They are supplied fixtures only; live authentication and provider smoke testing remain unverified.

Source attribution: [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), revision above. API references: [authentication](https://developers.statuscake.com/guides/api/authentication/), [uptime tests](https://developers.statuscake.com/guides/api/uptime-tests/). To smoke test manually, configure the token in the AppCall credential setup and invoke `healthcheck`; do not paste the token into logs or fixtures.
