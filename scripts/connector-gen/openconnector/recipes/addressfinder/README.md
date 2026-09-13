# Addressfinder

Read-only Addressfinder AU/NZ address autocomplete recipe. Create project credentials at https://portal.addressfinder.net/ and store the API key as `apiKey` and the API secret as `apiSecret`. Server-to-server requests send `key` and `format=json` as query parameters and the raw secret in the `Authorization` header to `https://api.addressfinder.io/api`. Do not send the secret from a browser.

## Operations

- `healthcheck`: `GET /nz/address/autocomplete?q=test&max=1` with empty input (pinned credential validator). Official pricing: autocomplete suggestions are not billed Lookups.
- `addresses.au.find`: `GET /au/address/autocomplete` with required `query` and optional `max` (1–100).
- `addresses.nz.find`: `GET /nz/address/autocomplete` with required `query` and optional `max` (1–100).

Address metadata, verification, email/phone verification, and international `{country}` autocomplete are omitted (metadata/verification consume billed Lookups; international path is computed). HTTP 200 bodies with a non-empty `message` are treated as errors. Successful responses are raw provider JSON under AppCall `data`. Native category is `utility` (source Location/Data are not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source and official docs agree on `https://api.addressfinder.io` and key+secret auth. Native always sends `format=json`. HTTP 200 `{success:false,message}` is demoted via `bodyErrorPaths: [message]` (`success` is not used because `true` would trip a boolean path). Comma-joined `state_codes` and other optional flags are omitted. The upstream user-agent is not sent. Responses keep raw Addressfinder JSON under `data` instead of the pinned `{success,completions,meta,raw}` wrapper.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
