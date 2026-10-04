# Agora

International Agora Console REST API recipe at version 0.2.0. Store the Customer ID and Customer Secret from Agora Console. The runner sends HTTP Basic Auth to `https://api.agora.io`.

Covered HTTP operations include project list/get/create/status, usage, app certificate set/reset, kicking rules, channel inventory, cloud recording acquire/query/stop, and notification-service IPs. EventOnly webhooks cover channel created/destroyed, broadcaster join/leave, and recording status.

The mainland-China REST host `api.sd-rtn.com` is not admitted. Responses are raw Agora JSON under `data`.
