export type HealthcheckResult = { connector: "calendly"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "calendly", status: "ok", source: "connector" }; }
