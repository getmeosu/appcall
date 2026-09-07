export type HealthcheckResult = { connector: "cal-com"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "cal-com", status: "ok", source: "connector" }; }
