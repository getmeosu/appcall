# BlazeMeter Service Virtualization

Read-only international **BlazeMeter Service Virtualization** recipe for `mock.blazemeter.com`. Create an API key under BlazeMeter Settings → API keys. Store the key ID as `apiKeyId` and the secret as `apiKey`. The runner sends HTTP Basic authentication (key ID as username, secret as password) plus `Accept: application/json`.

## Operations

- `healthcheck`: `GET /workspaces/{workspaceId}/service-mock-templates` (cheap authenticated list; pinned SV actions have no credential-only `/user` call, so `workspaceId` is required).
- `templates.list`: same path as healthcheck with required `workspaceId`.
- `templates.get`: `GET /workspaces/{workspaceId}/service-mock-templates/{templateId}` with required `workspaceId` and `templateId`.

`update_service_mock_template` (`PUT`) is omitted as a write.

## Adaptations

Official Service Virtualization docs use `https://mock.blazemeter.com/api/v1`, not the pinned shared runtime host `https://a.blazemeter.com/api/v4` (MailerLite-style host adaptation). Official list samples include `serviceId`; native requires `workspaceId` only, matching pinned source. Native omits the upstream user-agent and the pinned `Content-Type: application/json` header on GET. Native category is `dev-tools` (source Developer Tools). HTTP 200 envelopes use `bodyErrorPaths: ["error"]` because success sets `error` to `null`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://help.blazemeter.com/apidocs/service-virtualization/template_get_all.htm. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified. Configure `apiKeyId` and `apiKey`, call `healthcheck` with a workspace ID, then `templates.get`. Historical non-China records (Jenkins plugin CVE-2025-13472) are kept under the 2026-09-13 waiver.
