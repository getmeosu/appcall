# Claid AI

**HOLD.** Official international Claid image-editing API at `https://api.claid.ai/v1`. Configure an API key from https://claid.ai/account/api. The runner would send `Authorization: Bearer` plus `Accept: application/json`.

Pinned OpenConnector actions are billed image-edit operations. There is no cheap account/status/quota GET in the pinned action list and no pinned credential validator. Official `GET /v1/storage/storages` and `GET /v1/storage/storage-types` exist but are not pinned actions, so they cannot be used as healthcheck. Billable `POST /v1/image/edit` is not used as a healthcheck. `operationQuality` remains unproven, so selection is HOLD.

Documented operations (not admitted):

- `image.edit`: `POST /v1/image/edit` (credit-consuming)
- `image.edit.async`: `POST /v1/image/edit/async` (credit-consuming)
- `image.edit.task`: `GET /v1/image/edit/async/{taskId}` (poll of a billed task)

Multipart upload and AI-edit generation endpoints are omitted. Native category is `utility` (source AI / Design & Media; those buckets are not in the Rust CATEGORIES allowlist).

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.claid.ai/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
