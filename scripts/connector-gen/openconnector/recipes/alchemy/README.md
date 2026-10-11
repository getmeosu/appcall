# Alchemy

International Alchemy Ethereum mainnet JSON-RPC and NFT API recipe (v0.2.0). Authenticate with `Authorization: Bearer` against `https://eth-mainnet.g.alchemy.com` without putting the key in the URL path.

Healthcheck is JSON-RPC `eth_gasPrice`. Coverage includes core JSON-RPC reads, Token API balances/metadata/transfers, NFT API ownership/metadata/sales/rarity, and EventOnly webhooks for address, NFT, mined, and dropped activity.

The native key is `alchemy`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.alchemy.com/docs. Fixtures are independently derived and do not represent live provider access. Live authentication is unverified.
