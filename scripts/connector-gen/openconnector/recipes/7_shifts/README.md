# 7shifts

International **7shifts REST API v2** access-token recipe. Create a long-lived access token under Company Settings → Developer Tools and store it as `apiKey`. Requests send `Authorization: Bearer <token>` and `Accept: application/json` to `https://api.7shifts.com`.

## Operations

HTTP actions cover identity, companies, locations, departments, roles, users, shifts, time punches, and time off. EventOnly webhooks: `webhook.schedule_published`, `webhook.time_punch_created`, `webhook.user_created`, `webhook.location_created`.

Successful responses are raw provider JSON under AppCall `data`. Optional `apiVersion` sends `x-api-version`; the header is omitted when the input field is absent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
