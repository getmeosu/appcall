# Heyzine

Heyzine flipbook API1 recipe. Configure a Heyzine API key. The runner sends `Authorization: Bearer` to `https://heyzine.com`. Conversion endpoints also require the documented `client_id` input.

Covered HTTP operations (v0.2.0): `healthcheck`, flipbook list/get/create/create_async/update/delete/social.update, bookshelf list/flipbooks.list/add/remove/social.update, access setup/add/remove, and oembed.get. EventOnly webhooks: `webhook.leads`, `webhook.access_code`.

Write success fixtures omit `msg` because `http.errors.bodyErrorPaths` treats a non-empty `msg` as failure (needed for HTTP 200 `{success:false, msg}`).

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://heyzine.com/developers.
