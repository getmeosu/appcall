# Brave Search

**HOLD.** Official international Brave Search API at `https://api.search.brave.com`. Configure an API key from the Brave Search dashboard. The runner would send `X-Subscription-Token`.

Pinned OpenConnector has no cheap account/status/quota GET. The native credential validator is billed `GET /res/v1/web/search?q=brave+search`. Official Search pricing is $5 per 1,000 requests (with $5 monthly credits). Billable search is not used as healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Covered operations (not admitted):

- `web.search`: `GET /res/v1/web/search` with required `q` and optional `count` (1–20)
- `news.search`: `GET /res/v1/news/search` with required `q` and optional `count` (1–50)
- `videos.search`: `GET /res/v1/videos/search` with required `q` and optional `count` (1–50)
- `images.search`: `GET /res/v1/images/search` with required `q` and optional `count` (1–200)

Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist). LLM Context, Answers, Suggest, and Spellcheck are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api-dashboard.search.brave.com/documentation/guides/authentication. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
