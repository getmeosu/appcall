# Beamer

Read-only international **Beamer REST API v0** recipe. Create an API key under Settings > API at `https://app.getbeamer.com/settings` and store it as `apiKey`. Requests send `Beamer-Api-Key` and `Accept: application/json` to `https://api.getbeamer.com/v0`.

## Operations

- `healthcheck`: `POST /ping` with `{}` (documented authentication check; pinned credential validator).
- `posts.list`: `GET /posts` with optional `filter`, `language`, `category`, `published`, `archived`, `expired`, `maxResults` (1–10), and `page`.
- `unread.count`: `GET /unread/count` with optional `userId` and `filterByUserId`.
- `feed.url`: `GET /url` with optional `language`, `filterByUrl`, and `filter`.

Successful responses are raw provider JSON under AppCall `data`. `GET /posts` returns a JSON array. Writes (`create_post`) and `saveViews` analytics query flags are omitted.

## Adaptations

Pinned source and official API agree on `https://api.getbeamer.com/v0` and `Beamer-Api-Key`. Native category is `productivity` (source Communication/Productivity). Native does not uppercase `language`; send the two-letter code the API expects.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
