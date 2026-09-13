# Adafruit IO

Read-only Adafruit IO HTTP API v2 recipe. View or regenerate the AIO key at https://io.adafruit.com/ and store it as `apiKey`. Requests send `X-AIO-Key` and `Accept: application/json` to `https://io.adafruit.com/api/v2`. Official docs prefer the header over the `x-aio-key` query parameter. Data-modification APIs are rate-limited (free: 30 points/minute).

## Operations

- `healthcheck`: `GET /user` with empty input (pinned credential validator). Cheap authenticated read; not a billed data write.
- `feeds.list`: `GET /{username}/feeds`. `username` is required.
- `feeds.get`: `GET /{username}/feeds/{feedKey}`. `username` and `feedKey` are required.
- `feed-data.list`: `GET /{username}/feeds/{feedKey}/data` with optional `startTime`, `endTime`, and `limit` (1–1000).

Feed/data creates, updates, deletes, chart aggregation, and the `include` CSV field filter are omitted. Successful responses are raw provider JSON under AppCall `data`. Native category is `dev-tools` (source Data/Developer Tools).

## Adaptations

Pinned source and official docs agree on `https://io.adafruit.com/api/v2` and `X-AIO-Key`. Native requires `username` on feed operations instead of falling back to credential-validation metadata. Path segments are URL-encoded. `include` is omitted because the source comma-joins an array. The upstream user-agent is not sent. Responses keep raw Adafruit JSON under `data` instead of the pinned camelCase wrappers.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. The 2022-03-04 GitHub training-dataset disclosure is retained as dated historical evidence under the 2026-09-13 waiver.
