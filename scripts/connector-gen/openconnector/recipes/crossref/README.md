# Crossref

Read-only international **Crossref REST API v1** recipe. Crossref is the scholarly DOI registration agency operated by Publishers International Linking Association, Inc. (PILA), a New York nonprofit.

## Setup

Create a Metadata Plus API key at https://manage.crossref.org/keys after subscribing to Metadata Plus. Store it as `apiKey`. Requests send `Crossref-Plus-API-Token: Bearer <key>` and `Accept: application/json` to `https://api.crossref.org/v1`. Official docs document public (no auth) and polite (`mailto`) pools on the same host; this native edition always sends the Plus header because optional auth cannot be mixed with a required native `http.auth` block. Invalid Plus tokens return HTTP 401.

## Operations

- `healthcheck`: `GET /v1/works?rows=0` with empty input (cheap count probe; pinned Plus credential validator).
- `works.get`: `GET /v1/works/{doi}`; `doi` is a required string and is URL-encoded (slashes included).
- `works.agency.get`: `GET /v1/works/{doi}/agency`.
- `works.list`: `GET /v1/works` with optional `query`, `rows` (0–100), `offset` (0–10000), and `mailto`. Cursor pagination is omitted (pinned source HMAC-signs cursors).
- `styles.list`: `GET /v1/styles` with empty input.

Successful responses are raw provider JSON under AppCall `data`. Writes, citation transform, scoped/computed resource paths, and cursor mode are omitted.

## Adaptations

Pinned source uses `https://api.crossref.org/v1` (official tips page agrees; the REST overview also shows `https://api.crossref.org/` without `/v1`). Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist). Accept is `application/json` rather than `application/vnd.crossref-api-message+json`. Envelope `status !== "ok"` on HTTP 200 is not re-checked (`status: "ok"` would false-trigger `bodyErrorPaths`); Crossref errors use HTTP 4xx/5xx.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
