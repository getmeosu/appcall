# Lodgify

Read-only Lodgify Public API v2 recipe. Copy the API key from Settings → Public API and store it as `apiKey`. Requests send `X-ApiKey` and `Accept: application/json` to `https://api.lodgify.com`.

## Operations

- `healthcheck`: `GET /v2/properties?page=1&size=1&includeCount=true` (cheap authenticated read; matches pinned credential validation).
- `properties.list`: `GET /v2/properties` with optional `page`, `size` (1–50), and `includeCount`.
- `properties.get`: `GET /v2/properties/{propertyId}`.
- `rooms.list`: `GET /v2/properties/{propertyId}/rooms`.
- `bookings.list`: `GET /v2/reservations/bookings` with optional `page`, `size`, and `stayFilter` (`Upcoming`, `Current`, `Historic`, `All`).
- `bookings.get`: `GET /v2/reservations/bookings/{bookingId}`.

Successful responses are raw provider JSON under AppCall `data`. Quote calculation and availability-range reads are omitted, as are booking writes.

## Adaptations

Pinned source and official docs agree on `X-ApiKey` and `/v2/properties`. Native category is `scheduling` (source Productivity is on the allowlist; scheduling better matches vacation-rental bookings). Rooms and bookings paths follow pinned source (`/v2/properties/{id}/rooms` and `/v2/reservations/bookings`). Official property list documents `size` max 50.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
