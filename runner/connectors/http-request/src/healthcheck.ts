export type HealthcheckResult = {
  connector: "http-request";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "http-request", status: "ok", source: "connector" };
}
