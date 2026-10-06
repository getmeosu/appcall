# Beaconcha.in

International **Beaconcha.in Ethereum V2 API** recipe. Create an API key at `https://beaconcha.in/user/api-key-management` and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://beaconcha.in`. All curated operations are POST JSON.

## Operations

- `healthcheck`: `POST /api/v2/ethereum/queues` with `{"chain":"mainnet"}` (cheap authenticated network-queue read; pinned credential validator).
- `queues.get` / `queues.history`: current and historical staking queue metrics.
- `performance.get`: network performance aggregate for a named evaluation window.
- `state.get` / `epoch.get` / `slot.get` / `block.get` / `block.rewards`: explorer state and epoch, slot, or execution-block views.
- `deposits.get` / `withdrawals.get`: deposits and withdrawals for a slot view.
- `validators.get` / `validators.list` plus rewards, balances, performance, APY/ROI, proposal slots, and attestation slots.
- `ethStore.get` / `validatorStatuses.get`: ETH.STORE benchmark and validator-status distribution.

Successful responses are raw provider JSON under AppCall `data`. Writes, premium selectors (`entity`, `deposit_address`, `withdrawal`), and vendor webhooks are omitted.

## Adaptations

Pinned source and official V2 docs agree on `https://beaconcha.in` and Bearer auth. Native category is `utility` (source Finance/Data). Native identifier fields are string or non-negative integer because strict schemas cannot express `anyOf`. Native returns raw JSON rather than the source's normalized queue/validator objects.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
