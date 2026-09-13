# Checkout.com

**HOLD.** Official Checkout.com NAS Customers API is served from merchant-specific hosts `https://{prefix}.api.checkout.com` and `https://{prefix}.api.sandbox.checkout.com`. The `{prefix}` value is the first eight characters of the environment's `client_id` after `cli_`. Pinned OpenConnector computes that host from required `environment` plus caller-supplied `prefix`. Native templates cannot express the environment-dependent parent domain. Algolia bounded-wildcard + required stored id would cover only one parent at a time, and production and sandbox prefixes differ. This recipe is not admitted.

Documented operations (not admitted) would send `Authorization: Bearer` with a Secret API Key:

- `healthcheck`: pinned validator `GET /customers/oomol-connector-validation@invalid.example`, which treats HTTP 404 plus `cko-request-id` as success. Native `success:[200]` cannot express that.
- `customers.get`: `GET /customers/{identifier}`

Create/update/delete customer writes are omitted. Native category is `payments` (source Finance). `vkuhvk4v.api.sandbox.checkout.com` in fixtures is the official docs example prefix, not a globally shared Checkout.com product host.

November 2025 ShinyHunters access to a decommissioned pre-2020 third-party file store is recorded as a historical incident under the 2026-09-13 waiver. Checkout stated the live payment platform, merchant funds, and card numbers were not accessed.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://www.checkout.com/docs/developer-resources/api/api-endpoints. Fixtures are independently derived and do not represent live provider access.
