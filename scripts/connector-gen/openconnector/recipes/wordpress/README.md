# WordPress

WordPress REST API `wp/v2` recipe at version 0.2.0. Authenticate with an application password. Store the canonical hostname (no scheme) as `host`, plus `username` and `applicationPassword`. Requests use `https://{host}/wp-json/wp/v2` with HTTP Basic.

HTTP operations cover posts, pages, categories, tags, comments, users, and media. WordPress core does not expose outbound REST webhooks, so this recipe has none.
