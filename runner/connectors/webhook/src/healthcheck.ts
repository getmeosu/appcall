export type HealthcheckResult = {
  connector: "webhook";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "webhook", status: "ok", source: "connector" };
}
