# PDF.co

PDF.co Web API recipe for the international document API at api.pdf.co (Artifex Software, Inc. d/b/a ByteScout and PDF.co; United States). Copy an API key from https://app.pdf.co/ and store it as `apiKey`. Requests send `x-api-key` and `Accept: application/json` to `https://api.pdf.co`.

Operations cover the live Composio PDF_CO toolkit (49 HTTP tools) plus `healthcheck`: account balance, PDF info, conversion (to/from text, CSV, JSON, HTML, XML, XLS/XLSX, images, TIFF, WEBP), merge, split, compress (`/v2/pdf/compress`), retired optimize, document parser, barcode generate, file upload, and job check. `healthcheck` and `account.balance.get` call `GET /v1/account/credit/balance`. `pdf.info.get` is `POST /v1/pdf/info` with required `url` and always sends `async: false`.

`PDF_CO_PDF_FROM_HTML` maps to `POST /v1/pdf/convert/from/url` because Composio requires a URL. `PDF_CO_FILE_UPLOAD` uses `GET /v1/file/upload/url` when `url` is set and `POST /v1/file/upload/base64` when `file` is set (handwritten). `PDF_CO_PDF_TO_IMAGE` routes `imageFormat` PNG/JPG/TIFF to `/v1/pdf/convert/to/{png,jpg,tiff}` (handwritten; default png). Merge sends Composio `urls` as PDF.co `url`. Job check sends `job_id` as `jobid`.

HTTP 200 bodies with `error: true` are demoted via `http.errors.bodyErrorPaths` `["error"]` (`status` is not used because a numeric 200 or job `status: success` would count as an error). Responses keep raw PDF.co JSON under `data`. The upstream user-agent is not sent.

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://developer.pdf.co/api . Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure an API key, call `healthcheck` with `{}`.
