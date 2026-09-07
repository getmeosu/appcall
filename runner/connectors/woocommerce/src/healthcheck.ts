export type HealthcheckResult = { connector: "woocommerce"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "woocommerce", status: "ok", source: "connector" }; }
