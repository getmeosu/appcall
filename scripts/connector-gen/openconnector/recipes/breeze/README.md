# Breeze

Read-only international **Breeze ChMS** recipe. Store the account API key as `apiKey` plus the church subdomain as `subdomain` (the `{subdomain}` in `{subdomain}.breezechms.com`). Requests send `Api-Key` to `https://<subdomain>.breezechms.com`. Caller-supplied full URLs and per-request subdomain overrides are not admitted.

## Operations

- `healthcheck`: `GET /api/profile` (cheap authenticated profile-field list).
- `people.list`: `GET /api/people` with optional `details` (0 or 1), `limit` (>=0; 0 means all), `offset` (>=0), and `filter_json`.
- `people.get`: `GET /api/people/{person_id}`; `person_id` is required. Optional `details` (0 or 1).
- `tags.list`: `GET /api/tags/list_tags` with optional `folder_id`.
- `tag-folders.list`: `GET /api/tags/list_folders`.

Successful responses are raw Breeze JSON under AppCall `data`. People/tag mutations, events, giving, and forms are omitted.

## Adaptations

Pinned source accepted a per-action `subdomain` override and mapped boolean `details` to `1`/`0`. Native pins required stored subdomain on `*.breezechms.com` and uses the documented integer `details` plus string `filter_json` query. Native category is `crm` (source Communication is not in the Rust CATEGORIES allowlist).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://app.breezechms.com/api. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
