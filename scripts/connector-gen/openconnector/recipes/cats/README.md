# CATS

International **CATS Applicant Tracking System API v3** recipe with Composio `CATS_*` tools from **The Cat API**.

AppCall key `cats` is the recruiting ATS at [catsone.com](https://catsone.com/) (`Authorization: Token`, `https://api.catsone.com/v3`). Composio's `CATS` toolkit is a different product — The Cat API at [thecatapi.com](https://thecatapi.com/) (`x-api-key`, `https://api.thecatapi.com/v1`). Origin ATS operations are kept. The 18 Composio tools are real HTTP operations with per-operation `request.baseUrl` `https://api.thecatapi.com/v1` and `x-api-key: {{apiKey}}`. Connector-level auth remains `Authorization: Token {{apiKey}}`, so The Cat API calls send both headers.

This is not OpenCATS.

## Setup

Site administrators create a CATS v3 API key from CATS Administration settings, **or** a The Cat API key from https://thecatapi.com/signup. Store it as `apiKey`. Origin ATS operations send `Authorization: Token <key>` to `api.catsone.com`. Composio The Cat API operations also send `x-api-key: <key>` to `api.thecatapi.com`.

## Operations

Origin ATS (`https://api.catsone.com`):

- `healthcheck`: `GET /v3/site`
- `candidates.list` / `candidates.get`
- `jobs.list` / `jobs.get`

Composio The Cat API (`https://api.thecatapi.com/v1`):

- Favourites: `favourites.create`, `favourites.get`, `favourites.list`, `favourites.delete`
- Votes: `votes.create`, `votes.get`, `votes.list`, `votes.delete`
- Images: `images.search`, `images.get`, `images.list`, `images.delete`, `images.analysis.get`, `images.breeds.get`
- Breeds: `breeds.list` (`CATS_GET_PORTALS`), `breeds.get`, `breeds.search`
- Categories: `categories.list`

Successful JSON is raw provider JSON under AppCall `data`. The Cat API list/search endpoints return arrays. Optional query/body fields are omitted when unset. `CATS_SEARCH_IMAGES` `format=src` is accepted as input but is not JSON. Composio triggers = 0.

## Adaptations

Pinned open-connector CATS ATS source and official docs agree on `https://api.catsone.com/v3` and `Authorization: Token`. Composio tools follow The Cat API Postman/docs (`x-api-key`, `/v1/images/search`, `/v1/favourites`, `/v1/votes`, `/v1/breeds`). Native category stays `ats-recruitment` (origin ATS identity). `api.catsone.nl` is omitted.

## License and evidence

Upstream ATS definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. The Cat API operations are independently derived from official The Cat API docs and Composio CATS tool schemas. Fixtures are fixture-only; live smoke is unverified.
