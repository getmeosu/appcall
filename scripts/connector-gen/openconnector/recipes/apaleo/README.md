# apaleo

This recipe is **HOLD**. Official international apaleo Inventory API at `https://api.apaleo.com` (apaleo GmbH, Sandstr. 3, 80335 Munich, Germany). Official authentication is OAuth 2.0 only (authorization-code and client-credentials against `https://identity.apaleo.com`). Native recipe auth cannot express `authorizeUrl` / `tokenUrl`. No first-party API key is documented. Do not invent an API-key mapping.

Covered operations (not admitted): `healthcheck` and `properties.list` (`GET /inventory/v1/properties`), `properties.get` (`GET /inventory/v1/properties/{id}`), and `countries.list` (`GET /inventory/v1/types/countries`). Writes, HEAD existence checks, comma-joined array filters, and webhook fanout are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apaleo.dev/guides/oauth-connection/simple-client.html and https://apaleo.dev/guides/api/overview.html. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
