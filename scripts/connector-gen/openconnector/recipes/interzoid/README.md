# Interzoid

Read-only Interzoid Cloud API recipe. Copy the API license key from the Interzoid account page and store it as `apiKey`. The runner sends it as the documented `license` query parameter to `https://api.interzoid.com` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /getremainingcredits` (account credit probe; does not deduct credits; matches pinned credential validation).
- `email.info`: `GET /getemailinfo?email=` (consumes credits).
- `ip.profile`: `GET /getipprofile?lookup=` (consumes credits; native input name is `ip`).
- `company.match`: `GET /getcompanymatchadvanced?company=&algorithm=` (consumes credits).
- `organization.standardize`: `GET /getorgstandard?org=` (consumes credits; native input name is `organization`).

Successful responses are raw provider JSON under AppCall `data`. Full-name match/score writes-equivalent billed lookups beyond the selected reads are omitted.

## Adaptations

Pinned source and official docs agree on `license` query authentication at `api.interzoid.com`. Official also documents an `x-api-key` header variant; native does not send that header. Native category is `utility` (source Data/Developer Tools are not in the Rust CATEGORIES allowlist). Official JSON bodies include `Code` `Success`; native `bodyErrorPaths` use a non-empty `Message` because `Code=Success` would trip a string path. `algorithm` is any non-empty string because current official samples include `model-v3-wide` while pinned source enumerates `wide` / `narrow` / `model-v4-*`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
