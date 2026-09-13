# Canny

**HOLD.** Read-only international **Canny REST API v1** recipe is authored but not approved. Create a secret API key in Canny company settings and store it as `apiKey`. Requests `POST` JSON with `apiKey` in the body and `Content-Type: application/json` to `https://canny.io/api`.

## Operations

- `healthcheck`: `POST /v1/boards/list` with empty input (cheap authenticated board list; pinned credential validator).
- `boards.list`: `POST /v1/boards/list`.
- `boards.get`: `POST /v1/boards/retrieve` with required `boardID` sent as body `id`.
- `posts.list`: `POST /v1/posts/list` with optional `boardID`, `limit`, `skip`.
- `posts.get`: `POST /v1/posts/retrieve` with required `postID` sent as body `id`.

Successful responses would be raw provider JSON under AppCall `data`. User/comment writes are omitted.

## Adaptations

Official text and pinned source send JSON; official curl snippets use `-d` form fields. Native JSON body matches pinned source. Native input `boardID`/`postID` map to official body `id`. Native category is `productivity` (source Data is not in the Rust CATEGORIES allowlist). Returns raw Canny JSON under `data` (`appcall-provider-json-v1`) rather than the original curated `preserve-existing` result mapping. The upstream user-agent is not sent.

## HOLD reason

21bitcoin disclosed on 2026-09-02 that Canny was targeted on 2026-08-28 and an Intercom integration access key was stolen. Canny has not published a public RCA as of 2026-09-13. This is a current unresolved credible issue and is not treated as waived historical coverage.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
