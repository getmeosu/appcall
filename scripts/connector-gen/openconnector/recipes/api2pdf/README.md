# API2PDF

This recipe is **HOLD**. Official international API2PDF v2 REST API at `https://v2.api2pdf.com` (Api2Pdf, Arlington, United States). Configure an API key from https://portal.api2pdf.com/. The runner would send the raw key in `Authorization` plus `Accept: application/json`.

Pinned OpenConnector exposes only billed `POST /chrome/pdf/markdown`. Official SDKs and the pinned credential validator use `GET /balance`, which is not a pinned upstream action and cannot be fabricated as healthcheck. Billable conversion is not used as healthcheck.

Covered operation (not admitted): `markdown.to.pdf` (`POST /chrome/pdf/markdown` with required `markdown` and optional `fileName` / `inline`). HTTP 200 bodies with a populated `Error` string are demoted via `bodyErrorPaths`. HTML/URL conversion, merge, LibreOffice, and custom-domain hosts are omitted.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://www.api2pdf.com/ and https://github.com/Api2Pdf/api2pdf.node. Fixtures are independently derived and do not represent live provider access. Live authentication remains unverified.
