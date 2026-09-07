export type HealthcheckResult = { connector: "rb2b"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "rb2b", status: "ok", source: "connector" }; }
