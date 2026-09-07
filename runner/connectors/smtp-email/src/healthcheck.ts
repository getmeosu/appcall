export type HealthcheckResult = { connector: "smtp-email"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "smtp-email", status: "ok", source: "connector" }; }
