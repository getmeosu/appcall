export type HealthcheckResult = { connector: "automation-webhook"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "automation-webhook", status: "ok", source: "connector" }; }
