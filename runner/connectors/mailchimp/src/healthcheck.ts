export type HealthcheckResult = { connector: "mailchimp"; status: "ok"; source: "connector" };
export function healthcheck(): HealthcheckResult { return { connector: "mailchimp", status: "ok", source: "connector" }; }
