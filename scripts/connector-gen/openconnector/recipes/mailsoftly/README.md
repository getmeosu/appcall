# Mailsoftly

Read-only international **Mailsoftly API v3** recipe. Create an API token in Mailsoftly Company Settings. Store it as `apiKey`. The runner sends it as the `Authorization` header value with no Bearer prefix to `https://app.mailsoftly.com/api/v3`, plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /get_contact_lists` with empty input (cheap authenticated list read; not POST /authentication).
- `contacts.list`: `GET /get_contacts`.
- `contacts.get`: `GET /get_contact`; required integer `contact_id`, optional `type=detailed`.
- `contact-lists.list`: `GET /get_contact_lists`.
- `contact-lists.get`: `GET /get_contact_list`; required integer `contact_list_id`.

Successful responses are raw provider JSON under AppCall `data`. Contact and list writes and exact-match search are omitted. HTTP 200 bodies with a non-empty `error` string are treated as failures.

## Adaptations

Official curl uses `-H "Authorization: YOUR_API_KEY"`. Native auth copies that raw token. Healthcheck uses GET `/get_contact_lists` rather than the pinned POST `/authentication` validator so the probe stays a cheap authenticated read. `bodyErrorPaths` is `[error]` because `status` is a non-empty string on both success and error. Native category is `email-marketing`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
