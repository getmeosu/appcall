export type HealthcheckResult = {
  connector: "lever";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "lever", status: "ok", source: "connector" };
}
