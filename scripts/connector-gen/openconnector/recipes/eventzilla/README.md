# Eventzilla

International **Eventzilla API v2** recipe at version 0.2.0. Organizers create an API key under Settings > Developers > API Credentials. Store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://www.eventzillaapi.net/api/v2`.

## Operations

HTTP actions cover events, ticket types, attendees, transactions, checkout, categories, and users. `healthcheck` remains `GET /users?offset=0&limit=1`. Writes include toggle sales, ticket-type create/update, order confirm/cancel, checkout create/confirm, and attendee check-in.

EventOnly webhooks (no request block) cover vendor triggers `registration.confirmed`, `registration.updated`, `registration.pending`, `registration.abandoned`, `registration.waitlisted`, `registration.invoice.paid`, `registration.cancelled`, and `attendee.checkin`.

Successful HTTP responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://www.eventzillaapi.net/api/v2` and the `x-api-key` header. Native category is `scheduling`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
