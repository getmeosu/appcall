# Calendly

Read-only international **Calendly API v2** recipe. Create a personal access token under Integrations > API & Webhooks and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.calendly.com`. This is not OAuth-only; PAT Bearer is the native credential.

## Operations

- `healthcheck`: `GET /users/me` with empty input (cheap authenticated probe; pinned credential validator).
- `users.me`: `GET /users/me`.
- `eventTypes.list`: `GET /event_types` with required `userUri` (full Calendly user URI) and optional `count`, `pageToken`, `active`.
- `eventTypes.get`: `GET /event_types/{eventTypeUuid}`; `eventTypeUuid` is the official path UUID.
- `scheduledEvents.list`: `GET /scheduled_events` with required `userUri` and optional `count`, `pageToken`, `status`.

Successful responses are raw provider JSON under AppCall `data`. Organization-scoped lists, availability lookup, invitee writes, and webhook mutation are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.calendly.com`, Bearer PAT or OAuth access tokens, and `GET /users/me`. Native uses PAT Bearer (`api_key` setup) rather than an OAuth block. List operations require `userUri` instead of organization-or-user XOR. Get-event-type takes `eventTypeUuid` rather than extracting an id from a Calendly URI. Native category is `scheduling` (source Productivity). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
