# Amara

International **Amara REST API** recipe. Configure an API key from the Amara account page. The runner sends `x-api-key` and `Accept: application/json` to `https://amara.org/api`.

## Operations

Runner operations equal recipe operations (31 total): origin healthcheck plus every Composio AMARA tool as a real HTTP action.

- `healthcheck`: `GET /users/me/` credential check.
- Origin reads are kept: `languages.list`, `videos.list`, `videos.get` (`videoId`), `teams.list`. `videos.list` gained official/Composio filters (`order_by` from `sort`, `video_url`, `owner`, `project`, `language`, `archive`, `video_id`).
- Remaining Composio tools map onto videos, subtitle languages, subtitles, notes, actions, activity, users, teams, and messages.

Successful responses are raw Amara JSON under AppCall `data`. DELETE 204 and empty subtitle-action success return `{ data: { ok: true } }`. Pagination links are not followed.

## Adaptations

Pinned source and official docs agree on `x-api-key` and `https://amara.org/api`. Native category is `productivity`. Official paths win where they differ from pinned helpers: `POST /message/`, subtitle notes/actions under `/subtitles/`, and create-language `language_code`. `videos.get` keeps origin `videoId`. Fetch-subtitles sends Composio `format` as `sub_format` so the JSON envelope is preserved. URL lookup uses official `GET /videos/?video_url=`.

A 2018-05-24 PCF mailing-list website incident is retained as historical evidence and does not block this international edition under the 2026-09-13 waiver.

## License and evidence

Source attribution: oomol-lab/open-connector at `33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a` (Apache License 2.0). Official docs: https://apidocs.amara.org/. Fixtures are independently derived and do not represent live provider access. Live smoke remains unverified: configure `apiKey`, call `healthcheck` with `{}`, then `teams.list`.
