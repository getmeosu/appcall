# Teable

HOLD. Pinned OpenConnector Teable Cloud recipe. Official English Cloud is `https://app.teable.ai`; official Chinese Cloud is `https://app.teable.cn`; self-hosted uses a caller Site URL. The pinned source hardcodes `https://app.teable.cn/api` and PAT creation at `app.teable.cn`. Native templates cannot admit the China Cloud (EXCLUDE if admitted as-is), rewrite to the international host (different edition than pinned), or admit arbitrary self-hosted hosts.

Covered operations (not admitted): `healthcheck` (`GET /auth/user`), `spaces.list`, `bases.list`, and `tables.list`. Record list/get/write endpoints are omitted.

Native category is `productivity` (source Productivity/Data are not in the Rust CATEGORIES allowlist). The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://help.teable.ai/en/api-doc/overview and https://help.teable.ai/en/api-doc/token. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
