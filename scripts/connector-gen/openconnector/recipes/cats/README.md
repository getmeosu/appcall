# CATS

Read-only international **CATS Applicant Tracking System API v3** recipe. This is the recruiting ATS at [catsone.com](https://catsone.com/), not OpenCATS and not unrelated CAT-named products.

## Setup

Site administrators create a v3 API key from CATS Administration settings. Store it as `apiKey`. Requests send `Authorization: Token <key>` and `Accept: application/json` to `https://api.catsone.com`. Official docs also recommend `Content-Type: application/json`; native GET reads omit it because they have no body.

## Operations

- `healthcheck`: `GET /v3/site` with empty input (cheap authenticated site probe; pinned credential validator).
- `candidates.list`: `GET /v3/candidates` with optional 1-indexed `page` and `per_page` (1–100).
- `candidates.get`: `GET /v3/candidates/{candidate_id}`; `candidate_id` is a required positive integer.
- `jobs.list`: `GET /v3/jobs` with the same optional page filters.
- `jobs.get`: `GET /v3/jobs/{job_id}`; `job_id` is a required positive integer.

Successful responses are raw provider JSON under AppCall `data`. List endpoints return HAL envelopes with `_embedded`. Search, writes, companies, and the `api.catsone.nl` regional host are omitted.

## Adaptations

Pinned source and official docs agree on `https://api.catsone.com/v3`, `Authorization: Token`, and candidate/job paths. Native category is `ats-recruitment` (source Productivity is not in the Rust CATEGORIES allowlist). Healthcheck uses GET `/site` rather than a search. CATS wraps actions in `defineAction`, so catalog admission uses a reviewed-action-ids row rather than static `defineProviderAction` extraction.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
