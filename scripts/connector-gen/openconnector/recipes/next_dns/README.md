# NextDNS

NextDNS management API recipe. Configure an API key from the NextDNS account page and send it as `X-Api-Key` to `https://api.nextdns.io`. Native requests send `Accept: application/json` and omit the pinned helper's `user-agent`.

Covered operations: credential-only `healthcheck` (`GET /profiles`) plus the 68 Composio NEXTDNS tools (profiles, logs, analytics families, allowlist/denylist, rewrites, parental control, privacy, security, settings, and linked IP). Official HTTP 200 `{errors:[...]}` user errors are demoted via `bodyErrorPaths`. Native returns raw NextDNS JSON under `data`. `logs.download` always sends `redirect=0` because outbound 302s are blocked. Profile ID aliases (`profile`, `profileId`, `profile_id`, `config`, `config_id`) and `from_date`/`to_date` are accepted. Native category is `utility`.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache-2.0). Official docs: https://nextdns.github.io/api/. Fixtures are independently derived from official docs plus pinned source; live authentication remains unverified.
