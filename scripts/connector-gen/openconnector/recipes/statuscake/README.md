# StatusCake

Curated StatusCake connector covering the origin healthcheck plus the 30 Composio STATUSCAKE HTTP tools (uptime, heartbeat, pagespeed, SSL, contact groups, and monitoring locations). Pinned Open Connector source revision `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`.

Setup requires a StatusCake API token. The runner sends `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.statuscake.com/v1`. Create and update calls use `application/x-www-form-urlencoded`. Array fields (`tags`, `contact_groups`, `email_addresses`, `alert_at`, and similar) are encoded as `field[]` by the handwritten form handlers; scalar fields also have declarative `request` blocks so fixture replay stays compile-driven.

`uptimeTests.list` keeps origin `page`/`limit` and adds Composio `tags` and `uptime`. PageSpeed `page_size` and heartbeat `per_page` map to StatusCake `limit`. Uptime `check_rate` accepts StatusCake second enums and Composio interval aliases. `CREATE_SSL` is not a Composio tool and is omitted. Maintenance windows and EventOnly webhooks are omitted because they are not Composio tools.

Fixtures cover successful envelopes, origin pagination and schema-boundary cases, unauthorized origin reads, 201 create envelopes, and 204 write acknowledgements. They are supplied fixtures only; live authentication remains unverified.

Source attribution: [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector), revision above. API references: [authentication](https://developers.statuscake.com/guides/api/authentication/), [parameters](https://developers.statuscake.com/guides/api/parameters/), [uptime tests](https://developers.statuscake.com/guides/api/uptime-tests/), [API](https://developers.statuscake.com/api/). To smoke test manually, configure the token in the AppCall credential setup and invoke `healthcheck`; do not paste the token into logs or fixtures.
