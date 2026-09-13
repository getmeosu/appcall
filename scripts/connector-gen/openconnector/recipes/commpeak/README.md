# CommPeak

Read-only international **CommPeak TextPeak API** recipe. Create an API key in TextPeak Settings > API Keys and store it as `apiKey`. Requests send the raw token in `Authorization` (no `Bearer` prefix) and `Accept: application/json` to `https://gw.commpeak.com/textpeak`.

## Operations

- `healthcheck`: `GET /streams?itemsPerPage=1` with empty input (cheap authenticated probe; pinned credential validator).
- `streams.list`: `GET /streams` with optional `page` (sent as `_page`, 1-based) and `itemsPerPage` (1–100).
- `streams.get`: `GET /streams/{streamId}`; `streamId` is a required positive integer.
- `senders.list`: `GET /senders` with optional `page` (`_page`) and `itemsPerPage`.
- `domains.list`: `GET /domains` with optional `page` (`_page`) and `itemsPerPage`.

Successful responses are raw provider JSON under AppCall `data`. List endpoints return JSON arrays, so `outputSchema.data` allows array or object. SMS send, stream-token fetch, and other writes or two-step messaging calls are omitted.

## Adaptations

Pinned source and official docs agree on `https://gw.commpeak.com/textpeak` and a raw `Authorization` header (not Bearer). Native category is `messaging` (source Communication/Marketing are not in the Rust CATEGORIES allowlist). Healthcheck uses the validator's `/streams?itemsPerPage=1` rather than a search. Management GETs use HTTP status for errors; the HTTP 200 `status:false` envelope applies to messaging/OTP sends, which this recipe does not expose. Native `bodyErrorPaths` cannot invert a success boolean, so HTTP status remains the failure signal for these reads. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
