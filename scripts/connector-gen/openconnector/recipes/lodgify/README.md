# Lodgify

Lodgify Public API v1/v2 recipe covering the origin healthcheck plus documented Composio `LODGIFY_*` HTTP tools (26 of 30; channel inventory APIs have no public JSON). Copy the API key from Settings → Public API and store it as `apiKey`. Requests send `X-ApiKey` and `Accept: application/json` to `https://api.lodgify.com`.

## Operations

- Origin reads: `healthcheck` (`GET /v2/properties?page=1&size=1&includeCount=true`), `properties.list` / `properties.get`, `rooms.list`, `bookings.list` / `bookings.get`.
- Enquiries: create, call-me-back, decline, delete, recover, reopen.
- Inbox: `reservations.list` (`GET /v1/reservation`, distinct from v2 `bookings.list`), unread count, batch delete, mark replied / not replied.
- Availability: v2 property and room-type calendars (Composio `periodStart`/`periodEnd` map to official `start`/`end`), v1 availability list, set units.
- Reference: countries, currencies, deleted properties, external bookings, messaging threads.
- Webhooks: list, subscribe, unsubscribe (actions; subscribe is write, unsubscribe is destructive).

Empty 200 writes return `{success: true}`. Create enquiry / call-me-back and unread count return raw integer JSON under `data`. Official property list `size` remains 1–50. Channel list/connection/mapping/reservation tools are omitted (no documented public JSON).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.lodgify.com/docs/getting-started-1. Live authentication is unverified.
