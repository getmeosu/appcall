# Beaconcha.in

Read-only international **Beaconcha.in** recipe covering the Composio `BEACONCHAIN` toolkit (37 tools).
Create an API key at `https://beaconcha.in/user/api-key-management` and store it as `apiKey`.
Requests send `Authorization: Bearer` to `https://beaconcha.in`. Origin V2 operations remain POST JSON;
added Composio tools call the documented V1 GET endpoints with `apikey` as a query parameter.

## Operations

- `healthcheck`: `POST /api/v2/ethereum/queues` with `{"chain":"mainnet"}` (pinned credential validator).
- `queues.get`: `POST /api/v2/ethereum/queues` (Composio `BEACONCHAIN_GET_QUEUES`).
- `performance.get`: `POST /api/v2/ethereum/performance-aggregate` (Composio `BEACONCHAIN_GET_NETWORK_PERFORMANCE`; `evaluationWindow` maps to `range.evaluation_window`).
- `validators.get`: `POST /api/v2/ethereum/validators` (Composio `BEACONCHAIN_GET_VALIDATOR`).
- `validators.list`: `POST /api/v2/ethereum/validators` (Composio `BEACONCHAIN_POST_VALIDATORS`).
- Remaining 33 operations are official V1 GETs listed in `recipe.json` `selection.operations`.

Successful responses are raw provider JSON under AppCall `data`. Chart PNG and explorer health text are returned as strings. Writes and premium V2 selectors are omitted.

## Adaptations

Origin V2 ops keep their request shapes. Added tools follow Composio input names against beaconcha.in V1 paths from https://docs.beaconcha.in/api/v1-to-v2-migration. Native category is `utility`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
