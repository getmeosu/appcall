# AiVOOV

Read-only international **AiVOOV Text-to-Speech API v8** recipe. Create an API key from Profile → API and store it as `apiKey`. Requests send `X-API-KEY` and `Accept: application/json` to `https://aivoov.com/api/v8`.

## Operations

- `healthcheck`: `GET /voices` (cheap authenticated read; same path as the pinned credential validator). The documented daily cap is 20; this is not a billed synthesis call.
- `voices.list`: `GET /voices` with optional query `language_code` from input `languageCode`.

Successful responses are the raw provider JSON array under AppCall `data`. Billed `POST /create` (form-urlencoded `voice_id[]` arrays) is omitted.

## Adaptations

Pinned source and official GitHub/Postman docs agree on `https://aivoov.com/api/v8` and `X-API-KEY`. Native category is `utility` (source AI / Design & Media are not in the Rust CATEGORIES allowlist). Operator is AiVOOV in Rajkot, India; this is the global TTS edition, not a mainland-China product.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
