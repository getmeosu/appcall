# ClinicalKey

Read-only international Elsevier ClinicalKey COUNTER 5.1 (SUSHI) recipe. Store the Elsevier COUNTER API key as `apiKey` plus the institution `requestorId` and `customerId` from https://dev.elsevier.com/sushicop5.html. Requests call `https://api.elsevier.com/sushi/r51` with query `api_key`, `requestor_id`, `customer_id`, and hardcoded `platform=ck`.

## Operations

- `healthcheck`: `GET /reports` with empty input (pinned credential validator). Official `GET /status` is public and is not used.
- `members.list`: `GET /members`.
- `reports.get`: `GET /reports/{reportId}` with required `reportId`, `beginDate`, `endDate`, and optional `database`, `itemId`, `granularity` (`Month` / `Totals`).

Pipe-joined COUNTER array filters are omitted. Native returns raw Elsevier JSON under `data`. Native category is `utility` (source Data is not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source lowercases `reportId`; native cannot transform case, so callers pass the identifier as used on the wire. Native omits the upstream user-agent. March 2019 Elsevier server exposure is recorded under the 2026-09-13 waiver.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://dev.elsevier.com/sushicop5.html. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
