# Adyen

International Adyen Management API v3 recipe at version 0.2.0. Generate a Management API key in the Adyen Customer Area and set environment to `test` or `live`. The runner sends `X-API-Key` to `https://management-{{environment}}.adyen.com/v3`.

Covered HTTP operations include credential health, companies, merchants, stores, webhook configurations, API credentials, allowed origins, payment method settings, and users. EventOnly webhooks cover AUTHORISATION, CAPTURE, REFUND, CANCELLATION, and CHARGEBACK.

Hosts other than `management-test.adyen.com` and `management-live.adyen.com` are rejected. Responses are raw Adyen JSON under `data`.
