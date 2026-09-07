export type HealthcheckResult = {
  connector: "quickbooks";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "quickbooks", status: "ok", source: "connector" };
}
