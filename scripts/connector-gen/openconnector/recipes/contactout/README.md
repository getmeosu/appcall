# ContactOut

Read-only international **ContactOut REST API** recipe. Request an API token from ContactOut (official docs: book a meeting / API dashboard) and store it as `apiKey`. Requests send `token`, the documented literal `authorization: basic` header, and `Accept: application/json` to `https://api.contactout.com`.

## Operations

- `healthcheck`: `GET /v1/stats` with empty input (cheap authenticated usage probe; pinned credential validator). Not People Search.
- `stats.get`: `GET /v1/stats` with optional `period` (`YYYY-MM`).
- `people.linkedin.personal-email-status`: `GET /v1/people/linkedin/personal_email_status`; `profile` is a required LinkedIn URL. Official docs: does not consume credits.
- `people.linkedin.work-email-status`: `GET /v1/people/linkedin/work_email_status`; required `profile`.
- `people.linkedin.phone-status`: `GET /v1/people/linkedin/phone_status`; required `profile`.

Successful responses are raw provider JSON under AppCall `data`. People Search, People Enrich, contact reveal, email verify, and other credit-consuming lookups are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.contactout.com`, the `token` header, and `authorization: basic`. Native category is `crm` (source Data/Marketing are not in the Rust CATEGORIES allowlist). Healthcheck uses `/v1/stats` rather than billed search. `Content-Type` and the upstream user-agent are not sent on these GET reads.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
