# BigML

International BigML.io Andromeda API recipe. Configure the BigML username and API key from https://bigml.com/account/apikey. The runner sends `username` and `api_key` query parameters and `Accept: application/json` to `https://bigml.io/andromeda`.

Healthcheck is documented `GET /model?limit=1`. Origin model and prediction list/get reads are kept. Added Composio-mapped project, source, configuration, external-connector, and resource-list HTTP tools from https://bigml.com/api/ and https://docs.composio.dev/toolkits/bigml. Path ids are bare 24-character suffixes; native does not auto-prefix `project/` / `source/` as Composio slug descriptions sometimes show.

The native key is `bigml`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://bigml.com/api/. Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
