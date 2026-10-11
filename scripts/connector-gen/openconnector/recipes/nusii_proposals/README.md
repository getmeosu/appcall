# Nusii Proposals

International **Nusii Proposals REST API v2** recipe (v0.2.0). Create or view a token under Nusii Settings → API and store it as `apiKey`. Requests send `Authorization: Token token=<key>` and `Accept: application/json` to `https://app.nusii.com/api/v2`.

## Operations

- `healthcheck` / `account.get`: `GET /account/me`.
- Clients: `clients.list|get|create|update|delete`.
- Proposals: `proposals.list|get|create|update|delete`, `proposals.archive`, `proposals.send`.
- Templates: `templates.list|get`.
- Sections: `sections.list|get|create`.
- `users.list`, `themes.list`, `webhook_endpoints.list`.
- EventOnly webhooks: `webhook.proposal_accepted`, `webhook.proposal_sent`, `webhook.proposal_viewed`, `webhook.client_created`.

Successful responses are raw JSON:API under AppCall `data`.

## Adaptations

Pinned source and official docs agree on `https://app.nusii.com/api/v2/` and `Token token=`. Native base URL omits the trailing slash and uses `/account/me` paths. Native category is `productivity` (source Communication is not in the Rust CATEGORIES allowlist). Official docs recommend User-Agent and Content-Type; native omits the upstream user-agent and does not send Content-Type on these GETs. `recipient_emails` array is omitted because native query templates cannot comma-join; use `recipient_email`.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Fixtures are independently derived from official docs plus pinned source and are fixture-only; live smoke is unverified.
