# Acuity Scheduling

Acuity Scheduling REST API v1 recipe at version 0.2.0. Configure the numeric User ID (non-secret) and API key (secret). The runner sends HTTP Basic authentication with User ID as the Basic username and the API key as the Basic password to `https://acuityscheduling.com/api/v1`.

Covered HTTP operations include account health, calendars, appointment types, forms, appointments (list/get/create/update/cancel/reschedule), clients, availability dates/times, blocks, labels, and products. EventOnly webhooks cover appointment scheduled/rescheduled/canceled/changed and order.completed.

Successful responses are raw provider JSON under AppCall `data`. Native category is `scheduling`.
