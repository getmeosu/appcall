# Ambient Weather

Read-only international Ambient Weather REST API recipe. Configure an `apiKey` and `applicationKey` from https://ambientweather.net/account. Both keys are sent as query parameters to `https://rt.ambientweather.net`.

## Operations

- `healthcheck` / `devices.list`: `GET /v1/devices` (lists the caller's own stations; cheap authenticated read, not a billed forecast lookup).
- `devices.latest`: `GET /v1/devices/{macAddress}?limit=1`; `macAddress` is required.
- `devices.history`: `GET /v1/devices/{macAddress}` with optional `limit` (1–288) and `endDate`.

Realtime Socket.io on `rt2.ambientweather.net` and writes are omitted. Successful responses are raw provider JSON under AppCall `data`.

## Adaptations

Pinned source auto-resolves a default device by first listing stations; native requires `macAddress` and issues a single device GET. `endDate` is a string (ISO 8601 or epoch milliseconds). Native category is `utility` (source Location/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://github.com/ambient-weather/api-docs. Fixtures are independently derived and do not represent live provider access. Live smoke is unverified.
