# RiteKit

Read-only international RiteKit REST recipe for Maintop Businesses s.r.o. (Strážnice, Czech Republic). Configure a Client ID from the RiteKit API Console. The runner sends it as the documented `client_id` query parameter to `https://api.ritekit.com` plus `Accept: application/json`. Official OAuth 2.0 is unused here.

## Operations

- `healthcheck`: `GET /v1/search/trending?green=1&latin=1` with empty input (pinned credential validator).
- `hashtags.trending.list`: `GET /v1/search/trending` with optional integer `green` and `latin` (`0` or `1`).
- `hashtags.stats.get`: `GET /v1/stats/multiple-hashtags` with required comma-separated `tags`.
- `hashtags.suggest.text`: `GET /v1/stats/hashtag-suggestions` with required `text` (documented 1000-character cap is not enforced natively).

Auto-hashtag, URL/image suggestions, and Instagram cleaner writes are omitted. Native returns raw RiteKit JSON under `data`. HTTP 200 bodies with a populated `error` or `error_description` are treated as upstream errors; `result: false` cannot be inverted by native `bodyErrorPaths`.

## Adaptations

Pinned source and official docs agree on `https://api.ritekit.com` and `client_id` query authentication. `tags` is a comma-separated string rather than an array join. `green`/`latin` are integers `0|1` so the native query emits documented `1`/`0` rather than JSON booleans. Native category is `social` (source Social/Marketing; Rust CATEGORIES has no marketing bucket). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://ritekit.com/developer/dashboard/ and https://documenter.getpostman.com/view/2010712/SzS7Qku5. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
