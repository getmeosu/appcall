# Ambivo

International Ambivo CRM REST API recipe. Generate an integration token at https://account.ambivo.com/integrations and store it as `apiKey`. Requests send `Authorization: Bearer` and `Accept: application/json` to `https://fapi.ambivo.com`. Write operations also send `Content-Type: application/json`.

## Operations

Covers leads, contacts, accounts, deals/opportunities, and tasks: list, create, update, and task delete, plus created/status-updated polling reads. Healthcheck remains `GET /crm/leads?page_size=1&page_num=1`.

MongoDB `match_filter_dict` encoding, SSN fields, and social-profile arrays are omitted. Successful responses are raw provider JSON under AppCall `data`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://fapi.ambivo.com/docs and https://fapi.ambivo.com/openapi.json. Fixtures are independently derived. Live smoke is unverified.
