# AddressZen

Read-only AddressZen REST API v1 recipe. Create an API key (prefix `ak_`) from the AddressZen dashboard and store it as `apiKey`. Requests send `api_key` as a query parameter and `Accept: application/json` to `https://api.addresszen.com/v1`. Official docs: errors use non-200 HTTP status; autocomplete does not decrement balance; retrieving a suggestion does.

## Operations

- `healthcheck`: `GET /keys/{apiKey}` with empty input (pinned credential validator). Cheap key-availability read.
- `addresses.find`: `GET /autocomplete/addresses` with required `query` and optional `context`, `country`, and `limit` (1–100). Official wire name is `q`. Official docs cap query length at 150 characters; native omits `maxLength` because strict-generated schemas do not admit that constraint.
- `addresses.retrieve-usa`: `GET /autocomplete/addresses/{address}/usa`. `address` is the suggestion identifier. This is the billed retrieve step.

USPS verify POSTs, email/phone validation, and key-details (private, may require `user_token`) are omitted. Successful responses are raw provider JSON under AppCall `data`. Native category is `utility` (source Location/Data are not in the Rust CATEGORIES allowlist).

## Adaptations

Pinned source and official docs agree on `https://api.addresszen.com/v1`. Native sends `api_key` on every route, including `/keys/{key}` (pinned keys helper used path-only). Official authentication examples use `q` for autocomplete; pinned source sent `query`. Native binds input `query` to wire `q`. Path IDs are URL-encoded. The upstream user-agent is not sent.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
