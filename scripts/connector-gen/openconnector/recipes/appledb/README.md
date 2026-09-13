# AppleDB

**HOLD.** Community-maintained public static JSON API at `https://api.appledb.dev` (MIT, GitHub org `littlebyteorg`, credited to emiyl). appledb.dev states AppleDB is not affiliated with Apple Inc. Requests are unauthenticated `GET`s of static files.

Pinned OpenConnector `get_device` and `get_os_build` are simple JSON GETs. `search_devices` downloads `/device/main.json` and filters in-process (fanout). `search_os_builds` downloads an ICS calendar and parses it (unsupported). Native auth is `api_key` or `oauth2`; inventing a dummy secret would be untruthful. There is no cheap authenticated healthcheck. Operator geography/company country was not evidenced in this review. Selection is HOLD.

Covered operations (not admitted): `devices.get` → `GET /device/{key}.json`; `os-builds.get` → `GET /ios/{os};{build}.json`. Search actions omitted. Native category is `dev-tools` (source Developer Tools / Data; Data is not in the Rust CATEGORIES allowlist).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://github.com/littlebyteorg/appledb/blob/main/API.md. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified.
