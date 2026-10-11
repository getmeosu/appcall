// Single source of truth for the Klaviyo API revision header.
// Every Klaviyo request (http.ts client, healthcheck, parity_actions) imports
// this constant; no other revision literal may appear under src/.
// KV-0: Klaviyo retires the previous pin (2024-10-15) on 2026-10-15.
export const REVISION = "2026-07-15";
