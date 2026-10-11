# Kaleido

International Kaleido Platform API v1 recipe pinned to the documented default US host `console.kaleido.io`, covering origin healthcheck plus every Composio `KALEIDO_*` HTTP tool (29 tools, 32 operations; extras are origin `consortia.get` and `environments.list`).

## Setup

Configure an organization API key from the Kaleido console API Keys area. The runner sends `Authorization: Bearer` and `Accept: application/json` to `https://console.kaleido.io/api/v1`.

## Operations

- Auth: `healthcheck` (`GET /memberships`).
- Memberships / consortia / environments: origin `memberships.list`, `consortia.list`, `consortia.get`, `environments.list` (list ops gained optional Composio query fields).
- Organizations: `orgs.list`, `orgs.get`, `orgs.update`, `orgs.plan.get`, `orgs.billing_provider.get`, `billing.summary.get`.
- API keys: `apikeys.list`, `apikeys.get`, `apikeys.create`, `apikeys.delete`.
- Identity proofs: `identity_proofs.create`, `identity_proofs.get`, `identity_proofs.delete`.
- Roles: `roles.list`, `roles.get`, `roles.update`, `roles.upsert`.
- Catalog: `plans.list`, `regions.list`, `releases.list`, `invitations.list`, `services.list`, `appcreds.list`.
- Service fallbacks on the console host: `event_streams.list` (`GET /eventstreams`), `wallets.list` (`GET /wallets`), `wallets.accounts.get`, `token_factory.tokens.list` (`GET /contracts`). Caller-supplied service hosts are not interpolated.

Caller-supplied `baseUrl` and official regional hosts (`console-eu.kaleido.io`, `console-ap.kaleido.io`, `console-ko.kaleido.io`, `console-us1.kaleido.io`) are not expressed: the source accepts an optional URL from a bounded host set, which is not the Algolia-style required stored id plus bounded wildcard pattern.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://api.kaleido.io/platform.html, https://api.kaleido.io/hdwallet.html, https://api.kaleido.io/tokenfactory.html, and https://docs.kaleido.io/developers/automation/api-101/. Fixtures are independently derived from official docs plus pinned source and do not represent live provider access. Live smoke is unverified: configure the API key, call `healthcheck` with `{}`, then `orgs.list`.
