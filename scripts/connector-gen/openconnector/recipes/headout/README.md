# Headout

International **Headout public API v1** recipe (v0.2.0). Sign up on the official affiliate platform to receive a production API key by email and store it as `apiKey`. Requests send `Headout-Auth` and `Accept: application/json` to `https://www.headout.com/api/public/v1`.

## Operations

16 HTTP actions covering bookings (list/get/create/cancel), cities, categories, collections, subcategories, product listings, inventory, and reviews. Successful responses are raw provider JSON under AppCall `data`. Headout does not publish a partner webhook catalog, so EventOnly triggers are omitted.

## Adaptations

Production host is pinned to `www.headout.com`. Pinned source selects `sandbox.api.test-headout.com` when the key starts with `tk_`; computed hosts are unsupported, so sandbox keys are omitted. Native category is `ecommerce` (source Productivity/Data are not in the Rust CATEGORIES allowlist). Returns raw Headout JSON instead of the upstream normalized objects. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official partner docs plus pinned source and are fixture-only; live smoke is unverified.
