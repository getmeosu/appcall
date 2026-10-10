# Adafruit IO

Adafruit IO HTTP API v2 recipe covering origin healthcheck plus every Composio `ADAFRUIT_IO` HTTP tool (21 tools, 24 operations). View or regenerate the AIO key at https://io.adafruit.com/ and store it as `apiKey`. Requests send `X-AIO-Key` and `Accept: application/json` to `https://io.adafruit.com/api/v2`. Official docs prefer the header over the `x-aio-key` query parameter. Data-modification APIs are rate-limited (free: 30 points/minute).

## Operations

- `healthcheck`: `GET /user` with empty input (pinned credential validator; `ADAFRUIT_IO_GET_ACCOUNT_STATUS` identity).
- Feeds: origin `feeds.list` / `feeds.get` plus `feeds.create`, `feeds.update`, `feeds.delete`. Optional `groupKey` on create maps to `group_key`.
- Feed data: origin `feed-data.list` (optional `include` CSV and `nextCursor`→`before`) plus `feed-data.get`, `feed-data.create`, `feed-data.batch.create`, `feed-data.update`, `feed-data.delete`.
- Groups: `groups.list`, `groups.get`, `groups.create`, `groups.update`, `groups.delete`, `groups.feeds.add`, `groups.feeds.remove`. Add/remove are one official request per `feedKey`.
- Dashboards: `dashboards.list`, `dashboards.get`, `dashboards.create`, `dashboards.update`, `dashboards.delete`. `showHeader` maps to `show_header`.

Feed, group, and dashboard JSON bodies are wrapped (`{feed|group|dashboard: ...}`). Data create/update bodies are unwrapped datums; batch publish sends a JSON array. Successful DELETE responses map to `{success: true}`. `username` is required on user-scoped paths. Native category is `dev-tools`.

## Adaptations

Pinned source and official docs agree on `https://io.adafruit.com/api/v2` and `X-AIO-Key`. Native requires `username` on feed/group/dashboard/data operations instead of falling back to credential-validation metadata. Path segments are URL-encoded. Composio combined list-or-get tools are split to match origin `feeds.list`/`feeds.get`. Sequential Composio add/remove/delete-many loops are one documented provider request per key. Responses keep raw Adafruit JSON under `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. The 2022-03-04 GitHub training-dataset disclosure is retained as dated historical evidence under the 2026-09-13 waiver.
