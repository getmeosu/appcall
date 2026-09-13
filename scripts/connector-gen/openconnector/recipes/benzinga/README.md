# Benzinga

Read-only international Benzinga REST recipe for Benzinga (Detroit). Configure an API token from the Benzinga API dashboard. The runner sends it as the documented `token` query parameter to `https://api.benzinga.com` plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /api/v2.1/news/channels` with empty input (pinned credential validator).
- `news.channels.list`: same news-channel catalog.
- `earnings.list`: `GET /api/v2.1/calendar/earnings` with optional `symbol`, `dateFrom`, `dateTo`, `page`, and `limit` (wire names `parameters[tickers]`, `parameters[date_from]`, `parameters[date_to]`, `page`, `pagesize`).
- `ratings.list`: `GET /api/v2.1/calendar/ratings` with the same optional calendar filters.
- `consensus.ratings.get`: `GET /api/v1/consensus-ratings` with required `symbol`.

News search, quotes, WebSocket streams, and writes are omitted. Healthcheck uses the news-channel directory rather than a billed quote lookup. HTTP 200 bodies with a populated `errors` array are treated as upstream errors.

## Adaptations

Pinned source and official docs agree on HTTPS `api.benzinga.com` and `token` query authentication. Native category is `banking-data` (source Finance/Data are not in native CATEGORIES). Native returns raw Benzinga JSON under `data`. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.benzinga.com/introduction/introduction. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
