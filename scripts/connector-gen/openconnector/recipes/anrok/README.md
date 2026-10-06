# Anrok

International Anrok Seller API recipe. Create an API key at https://app.anrok.com/-/api-keys and store it as `apiKey`. Requests send `Authorization: Bearer`, `Accept: application/json`, and `Content-Type: application/json` to `https://api.anrok.com`. All covered operations are HTTP POST with a JSON body.

## Operations

Covers customers, products, product tax categories, transactions (get/list/createOrUpdate/createEphemeral/void), certificates, filings, address resolution, and tax ID validation. Certificate-file uploads remain omitted. Successful responses are raw provider JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://apidocs.anrok.com/. Fixtures are independently derived. Live smoke is unverified.
