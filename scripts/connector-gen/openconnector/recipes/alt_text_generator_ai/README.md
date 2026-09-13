# Alt Text Generator AI

**HOLD.** Official international Alt Text Generator AI recipe at `https://alttextgeneratorai.com`. Configure an API key from the dashboard. The runner would send JSON `{image, wpkey}` to `POST /api/wp`.

Pinned OpenConnector exposes only billed `generate_alt_text`. There is no cheap account/status/quota GET. The native credential validator is `local_non_empty_key` and never calls the network. Official docs: each call consumes one credit; remaining credits are a dashboard page, not a pinned action. Success bodies are plain text, which `responseFormat: json` cannot express. `operationQuality` remains unproven, so selection is HOLD.

Covered operation (not admitted): `generate.alt-text`. Native category is `utility` (source AI / Design & Media).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://alttextgeneratorai.com/api-docs. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
