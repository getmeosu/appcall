# Calendarific

**HOLD.** Official international Calendarific Holidays API v2 at `https://calendarific.com/api/v2`. Configure an API key from the Calendarific dashboard. The runner sends `api_key` as a query parameter and `Accept: application/json`.

This recipe is **HOLD**. Healthcheck is omitted rather than using a billed lookup. Official docs state every request to any endpoint counts toward the monthly quota (Free plan 500 requests/month), including errors. The pinned credential validator is billed `GET /countries`. `/languages` and `/holidays` also consume quota. There is no cheap unbilled account/status/quota GET.

Covered operations (not admitted): `countries.list`, `languages.list`, and `holidays.get`. Holiday `type` comma-join and `uuid` are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://calendarific.com/api-documentation. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
