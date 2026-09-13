# Alchemy

Read-only international Alchemy Ethereum mainnet recipe. Copy an API key from the Alchemy dashboard app details page. The runner sends `Authorization: Bearer` plus `Accept: application/json` to `https://eth-mainnet.g.alchemy.com` (official header-based auth; the API key is not placed in the URL).

## Operations

- `healthcheck`: JSON-RPC `POST /v2` `eth_gasPrice` with empty input (pinned credential validator, 20 CU).
- `token.metadata.get`: JSON-RPC `alchemy_getTokenMetadata` with required `contractAddress`.
- `nfts.owner.list`: `GET /nft/v3/getNFTsForOwner` with required `owner` and optional `withMetadata`, `pageKey`, `pageSize`.
- `nft.metadata.get`: `GET /nft/v3/getNFTMetadata` with required `contractAddress` and `tokenId`, optional `tokenType`.

Token-balance and asset-transfer RPCs are omitted because their params arrays/objects are computed from optional inputs. NFT `contractAddresses[]` filters are omitted. Native returns raw JSON-RPC or NFT JSON under `data`. HTTP 200 bodies with a non-empty `error` object fail via `bodyErrorPaths`. Native category is `dev-tools` (source Developer Tools / Data / Finance).

## Adaptations

Pinned source and official header-based docs agree on `Authorization: Bearer` to `/v2` and `/nft/v3/getNFTsForOwner` without an API-key path segment. Reference NFT docs still show `/nft/v3/{apiKey}/...`; this recipe follows the header-based guide. Healthcheck is the pinned `eth_gasPrice` probe rather than a billed NFT/token lookup. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.alchemy.com/docs/how-to-use-api-keys-in-http-headers. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
