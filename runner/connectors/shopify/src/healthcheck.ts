export type HealthcheckResult = { connector: "shopify"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "shopify", status: "ok", source: "connector" }; }
