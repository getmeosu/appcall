# Perigon

Read-only Perigon News API recipe for Perigon, Inc. (Austin, Texas). Create an API key in the developer section at https://www.perigon.io/dev and store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://api.perigon.io`. Official docs also allow `Authorization: Bearer` and `apiKey` query; native uses the documented `x-api-key` header.

Selected operations are `healthcheck` (`GET /v1/topics/all?size=1`), `topics.list` (`GET /v1/topics/all` with optional name/category/subcategory/page/size), `journalists.get` (`GET /v1/journalists/{id}`), and `people.search` (`GET /v1/people/all` with required `q`). Healthcheck uses the pinned topics probe rather than article search. Articles, stories, summarizer, vector search, Wikipedia, and writes are omitted.

Adaptations versus the pinned OpenConnector source: native category is `utility`; path uses `/v1/topics/all` from pinned source and agent-skills rather than the topics-types shorthand `/v1/topics`; `X-Rate-Limit-Retry-After-Millis` is not used as retry-after because native retry-after is seconds; responses keep raw Perigon JSON under `data` instead of source wrappers; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://perigon.io/docs/api/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`.
