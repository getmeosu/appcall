export type HealthcheckResult = { connector: "zoom"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "zoom", status: "ok", source: "connector" }; }
