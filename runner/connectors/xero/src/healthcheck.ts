export type HealthcheckResult = {
  connector: "xero";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "xero", status: "ok", source: "connector" };
}
