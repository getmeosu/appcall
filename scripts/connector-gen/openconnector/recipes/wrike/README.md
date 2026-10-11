# Wrike

International **Wrike REST API v4** recipe. Auth is a permanent access token sent as `Authorization: Bearer` against `https://www.wrike.com/api/v4`. Recipe operations equal runner operations. Writes use Wrike query parameters (JSON-encoded arrays via `contentMediaType`), not JSON bodies. EventOnly webhooks use `sideEffect` `read`.

Pinned open-connector revision: `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: [Wrike API overview](https://developers.wrike.com/overview). Multipart attachment upload, DataHub, and Cloud Content Connector stay out of scope. Live smoke is unverified.
