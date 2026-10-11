# Kit

International Kit (ConvertKit) API v4 recipe. Auth uses `X-Kit-Api-Key` against `https://api.kit.com/v4`.

## Operations

- `healthcheck`: `GET /account`
- `subscribers.list`: `GET /subscribers`
- `subscribers.get`: `GET /subscribers/{{id}}`
- `forms.list`: `GET /forms`
- `subscribers.create`: `POST /subscribers`
- `subscribers.update`: `PUT /subscribers/{{id}}`
- `subscribers.unsubscribe`: `POST /subscribers/{{id}}/unsubscribe`
- `forms.subscribe`: `POST /forms/{{form_id}}/subscribers`
- `forms.subscribers.list`: `GET /forms/{{form_id}}/subscribers`
- `tags.list`: `GET /tags`
- `tags.create`: `POST /tags`
- `tags.subscribers.add`: `POST /tags/{{tag_id}}/subscribers`
- `tags.subscribers.remove`: `DELETE /tags/{{tag_id}}/subscribers/{{id}}`
- `sequences.list`: `GET /sequences`
- `sequences.subscribe`: `POST /sequences/{{sequence_id}}/subscribers`
- `custom_fields.list`: `GET /custom_fields`
- `custom_fields.create`: `POST /custom_fields`
- `broadcasts.list`: `GET /broadcasts`
- `broadcasts.get`: `GET /broadcasts/{{id}}`
- `purchases.list`: `GET /purchases`
- `webhook.subscriber.created`: EventOnly webhook
- `webhook.subscriber.activated`: EventOnly webhook
- `webhook.subscriber.unsubscribed`: EventOnly webhook
- `webhook.subscriber.subscribed_to_form`: EventOnly webhook
- `webhook.subscriber.added_to_sequence`: EventOnly webhook
- `webhook.subscriber.tag_added`: EventOnly webhook
- `webhook.subscriber.tag_removed`: EventOnly webhook
- `webhook.subscriber.custom_field_value_updated`: EventOnly webhook
- `webhook.subscriber.product_purchased`: EventOnly webhook
- `webhook.tag.created`: EventOnly webhook
- `webhook.tag.deleted`: EventOnly webhook
- `webhook.custom_field.created`: EventOnly webhook
- `webhook.custom_field.deleted`: EventOnly webhook
- `webhook.sequence.created`: EventOnly webhook
- `webhook.sequence.deleted`: EventOnly webhook
- `webhook.sequence.published`: EventOnly webhook
- `webhook.sequence.disabled`: EventOnly webhook
- `webhook.broadcast.created`: EventOnly webhook
- `webhook.broadcast.deleted`: EventOnly webhook

Official docs: https://developers.kit.com/api-reference/overview. Fixtures are independently derived. Live smoke remains unverified.
