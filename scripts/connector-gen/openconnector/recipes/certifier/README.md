# Certifier

International Certifier REST API recipe. Create an access token in Settings → Developers → Access Tokens. The runner sends `Authorization: Bearer` and the required `Certifier-Version: 2022-10-26` header to `https://api.certifier.io/v1`.

## Operations

- `healthcheck` / `groups.list` / `groups.get` / `groups.create` / `groups.update` / `groups.delete`
- `designs.list` / `designs.get`
- `credentials.list` / `credentials.get` / `credentials.create` / `credentials.update` / `credentials.delete`
- `credentials.search` / `credentials.issue` / `credentials.send` / `credentials.createIssueSend` / `credentials.designTemplates`
- `interactions.list` / `attributes.list`
- EventOnly webhooks: `webhook.credential.created`, `webhook.credential.updated`, `webhook.credential.deleted`, `webhook.credential.issued`

Groups are still addressed at `/groups` while Certifier docs rename them credential templates.

## License and evidence

Upstream definitions are attributed to [oomol-lab/open-connector](https://github.com/oomol-lab/open-connector) (Apache-2.0) at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a`. Official docs: https://developers.certifier.io/docs/api-reference/quickstart. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
