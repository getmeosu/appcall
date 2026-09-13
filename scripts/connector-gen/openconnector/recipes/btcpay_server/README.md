# BTCPay Server

**HOLD.** Official BTCPay Server Greenfield API is served from a merchant-owned instance host. Pinned OpenConnector requires a caller-supplied HTTPS Server URL (placeholder `https://btcpay.example.com`). `mainnet.demo.btcpayserver.org` is a public demo, not a product cloud, so an Algolia/Grafana stored-id + bounded-wildcard pattern does not apply. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: token {apiKey}` to `/api/v1`:

- `healthcheck` / `stores.list`: `GET /stores`
- `stores.get`: `GET /stores/{storeId}`
- `invoices.list`: `GET /stores/{storeId}/invoices`
- `invoices.get`: `GET /stores/{storeId}/invoices/{invoiceId}`

Invoice create/update/status writes, Greenfield Basic auth, and private-network HTTP hosts are omitted. Native category is `payments` (source Finance). `btcpay.example.com` in fixtures is the pinned definition placeholder, not a BTCPay Cloud product host.

The August 2026 LND macaroon theft / Greenfield Basic TOTP bypass (patched in 2.4.2) is recorded under the 2026-09-13 historical-incident waiver. The HOLD is the caller-supplied host.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://docs.btcpayserver.org/API/Greenfield/v1/. Fixtures are independently derived and do not represent live provider access.
