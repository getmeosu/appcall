# Beaconcha.in

Read-only international **Beaconcha.in Ethereum V2 API** recipe. Create an API key at `https://beaconcha.in/user/api-key-management` and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://beaconcha.in`. All curated operations are POST JSON.

## Operations

- `healthcheck`: `POST /api/v2/ethereum/queues` with `{"chain":"mainnet"}` (cheap authenticated network-queue read; pinned credential validator).
- `queues.get`: `POST /api/v2/ethereum/queues` with optional `chain` (`mainnet` or `hoodi`).
- `performance.get`: `POST /api/v2/ethereum/performance-aggregate` with required `evaluationWindow` (`24h`, `7d`, `30d`, `90d`, `all_time`) as `range.evaluation_window`.
- `validators.get`: `POST /api/v2/ethereum/validators` with required `validatorIdentifier` (index or public key).
- `validators.list`: `POST /api/v2/ethereum/validators` with required `validatorIdentifiers` and optional `cursor` / `pageSize` (1–10).

Successful responses are raw provider JSON under AppCall `data`. Writes, premium selectors (`entity`, `deposit_address`, `withdrawal`), and rewards-list are omitted.

## Adaptations

Pinned source and official V2 docs agree on `https://beaconcha.in` and Bearer auth. Native category is `utility` (source Finance/Data). Native identifier fields are string or non-negative integer because strict schemas cannot express `anyOf`. Native returns raw JSON rather than the source's normalized queue/validator objects.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
