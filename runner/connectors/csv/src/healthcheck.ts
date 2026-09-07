export type HealthcheckResult = {
  connector: "csv";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "csv", status: "ok", source: "connector" };
}
