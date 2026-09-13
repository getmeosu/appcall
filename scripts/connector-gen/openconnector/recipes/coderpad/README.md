# CoderPad

Read-only international **CoderPad Interview API** recipe for `app.coderpad.io`. Enterprise administrators generate an Interview API key at [Settings](https://app.coderpad.io/dashboard/settings) and store it as `apiKey`. Requests send `Authorization: Token token="<key>"` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /api/organization` (cheap authenticated org-profile read; same path as the pinned credential validator).
- `pads.list`: `GET /api/pads/` with optional `sort` and `page`.
- `pads.get`: `GET /api/pads/{padId}`; `padId` is required.
- `questions.list`: `GET /api/questions/` with optional `sort` and `page`.
- `questions.get`: `GET /api/questions/{questionId}`; `questionId` is required.

POST `/api/pads/` is omitted because the pinned runtime sends multipart `FormData`. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source and the Interview API key page agree on `https://app.coderpad.io` and `Token token=` auth. Native categories are `ats-recruitment` and `dev-tools` (source Productivity/Developer Tools). Native omits the upstream user-agent. Pinned runtime rejects HTTP 200 when `status` is not `OK`. Native `bodyErrorPaths` is `[message]` because success `status` `OK` is a non-empty string.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the Interview API key, call `healthcheck` with `{}`, then `pads.list`.
