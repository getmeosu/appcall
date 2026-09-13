# Fern

Read-only international Fern Money Developer API recipe at `https://api.fernhq.com`. Create an API key in the Fern developer dashboard. The runner sends `Authorization: Bearer`. Distinct from buildwithfern.com (API docs tooling).

Covered operations: credential-only `healthcheck` (`GET /customers?pageSize=1`, matching the pinned source credential probe), `customers.list` with optional `pageSize` (1–100) and `pageToken`, `customers.get`, `payment-accounts.get`, and `transactions.get`. Quote/exchange-rate reads, customer writes, and transaction creation are omitted. Provider `nextPageToken` is never followed automatically.

Native category is `payments` (source Finance is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.fernhq.com/api-reference/customers/list-customers. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure the API key, call `healthcheck` with `{}`, then `customers.list`.
