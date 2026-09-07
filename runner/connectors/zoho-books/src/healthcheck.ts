export type HealthcheckResult = { connector: "zoho-books"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "zoho-books", status: "ok", source: "connector" }; }
