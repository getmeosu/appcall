# The Dog API

Read-only international The Dog API v1 recipe. Sign up for an API key at https://thedogapi.com. The runner sends `x-api-key` and `Accept: application/json` to `https://api.thedogapi.com/v1`.

Covered operations: credential-only `healthcheck` (`GET /breeds?limit=1`), `breeds.list`, `breeds.get`, `images.get`, and `favourites.list`. Image search, breed search, votes, and favourite create/delete are omitted.

Native category is `utility` (source Design & Media / Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.thedogapi.com/docs/examples/breeds, https://docs.thedogapi.com/docs/examples/images, and https://docs.thedogapi.com/docs/examples/votes-favourites. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `breeds.list`.
