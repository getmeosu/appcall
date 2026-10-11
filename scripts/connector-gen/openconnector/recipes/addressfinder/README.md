# Addressfinder

Read-only Addressfinder recipe covering origin healthcheck plus every Composio `ADDRESSFINDER_*` HTTP tool (17 tools, 18 operations; healthcheck is an unbilled NZ autocomplete probe and is not a Composio slug).

Create project credentials at https://portal.addressfinder.net/ and store the API key as `apiKey` and the API secret as `apiSecret`. Server-to-server requests send `key` and `format=json` as query parameters and the raw secret in the `Authorization` header to `https://api.addressfinder.io/api`. Do not send the secret from a browser.

## Operations

- `healthcheck`: `GET /nz/address/autocomplete?q=test&max=1` with empty input (pinned credential validator). Official pricing: autocomplete suggestions are not billed Lookups.
- AU addresses: `addresses.au.find`, `addresses.au.metadata`, `addresses.au.verify`.
- NZ addresses: `addresses.nz.find`, `addresses.nz.metadata`, `addresses.nz.verify`, `addresses.nz.reverse_geocode`.
- International addresses: `addresses.international.find`, `addresses.international.metadata` (`GET /{country}/address/v2/...` with a documented ISO alpha-2 path segment).
- Locations: `locations.au.find`, `locations.au.metadata`, `locations.nz.find`, `locations.nz.metadata`.
- NZ points of interest: `poi.nz.find`, `poi.nz.metadata` on official `/nz/points_of_interest/...` paths.
- Verification: `emails.verify`, `phones.verify`.

`query` is the AppCall input for official `q`. `format` and `secret` are not caller inputs (`format=json` is always sent; the secret is the `Authorization` header). Optional filters are omitted when unset. HTTP 200 bodies with a non-empty `message` are treated as errors. Successful responses are raw provider JSON under AppCall `data`. Native category is `utility`.

## Adaptations

Pinned source and official docs agree on `https://api.addressfinder.io` and key+secret auth. Origin AU/NZ autocomplete keep required `query` plus optional `max`, and now forward the remaining Composio scalar filters. International `{country}` is a required path segment from the documented country allowlist (max 1-15). Metadata/verification consume billed Lookups; they are included because they are Composio tools. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://addressfinder.com/nz/docs/api/overview and https://docs.composio.dev/toolkits/ADDRESSFINDER. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
