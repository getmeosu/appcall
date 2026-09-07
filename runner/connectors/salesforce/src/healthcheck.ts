export type HealthcheckResult = {
  connector: "salesforce";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "salesforce", status: "ok", source: "connector" };
}
