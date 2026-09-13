# Check

Read-only international Check production Payroll API recipe. Configure a production API key from Check Console. The runner sends `Authorization: Bearer` to `https://api.checkhq.com`. Sandbox `sandbox.checkhq.com` is omitted because native cannot compute the host from the official environment enum `sandbox` | `production`.

Covered operations: credential-only `healthcheck` (`GET /agencies?limit=1`), `agencies.list`, and `agencies.get`. Address validation (`POST /addresses/validate`) and payroll writes are omitted. Repeated `id` / `jurisdiction` list filters are omitted.

Adaptations versus the pinned OpenConnector source: production host is pinned rather than selected from the extra `environment` field; native category is `payments` rather than Finance/Data; responses are raw Check JSON under `data`; the upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://docs.checkhq.com/docs/authentication. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
