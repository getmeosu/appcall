# Blocknative

HOLD. International Blocknative Gas Platform API at `https://api.blocknative.com`. Configure an API key from https://www.blocknative.com/request-api-key. The runner sends the raw key in the `Authorization` header (not Bearer) plus `Accept: application/json`.

Official homepage (as of 2026-09-13): the Blocknative team joined Deloitte and **API services stopped responding after 2026-06-19**. `officialApi` and `operationQuality` remain unproven, so selection is HOLD.

Covered operations (not admitted):

- `healthcheck` / `chains.list`: `GET /chains` (pinned cheap credential validator; official docs mark the key optional on this path).
- `oracles.list`: `GET /oracles`.

`GET /gasprices/blockprices` and `GET /gasprices/distribution` are omitted as prediction lookups and are not used as healthcheck.

Native category is `dev-tools` (source Data is not in the Rust CATEGORIES allowlist). Native omits the upstream user-agent. Returns raw provider JSON under `data` instead of the pinned chains/oracles unwrap.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.blocknative.com/gas-prediction/gas-platform-1. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
