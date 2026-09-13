# BigML

Read-only international BigML.io Andromeda API recipe. Configure the BigML username and API key from https://bigml.com/account/apikey. The runner sends `username` and `api_key` query parameters and `Accept: application/json` to `https://bigml.io/andromeda`.

Healthcheck is documented `GET /model?limit=1`, the cheap authenticated model list used by the pinned credential validator, not a billed prediction create. Model and prediction list/get reads are included. Create/delete prediction writes and private/VPC API hosts are omitted.

Native `modelId` / `predictionId` are bare resource ids in `/model/{id}` and `/prediction/{id}`; native does not auto-prefix `model/` as the pinned runtime does. Native category is `dev-tools` (source AI/Data).

The native key is `bigml`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://bigml.com/api/. Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
