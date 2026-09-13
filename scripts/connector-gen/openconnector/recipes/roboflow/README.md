# Roboflow

Read-only international **Roboflow management REST API** recipe. Create a private workspace API key at [app.roboflow.com/settings/api](https://app.roboflow.com/settings/api). Store it as `apiKey`. Requests send `Accept: application/json` to `https://api.roboflow.com` with the key as query `api_key`.

## Operations

- `healthcheck`: `GET /?api_key=` with empty input (official root identity check and pinned credential validator).
- `projects.get`: `GET /{{workspace}}/{{project}}` for one project and its versions.
- `versions.get`: `GET /{{workspace}}/{{project}}/{{version}}` for one dataset version.

Successful responses are raw provider JSON under AppCall `data`. Hosted inference (`detect.roboflow.com` / `serverless.roboflow.com`), workflow run/validate POSTs, object detection, Prometheus metrics text, and dataset downloads are omitted.

## Adaptations

Official docs now recommend `Authorization: Bearer`. Query `api_key` remains the documented legacy channel and matches the pinned source wire, so native uses query `api_key`. Native category is `dev-tools` (source AI/Developer Tools; AI is not in the Rust CATEGORIES allowlist). Official `GET /:workspace` lists projects but is not a pinned empty-input action; `list_projects` is mapped to root `GET /` as in the pinned validator. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
