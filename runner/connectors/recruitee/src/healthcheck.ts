export type HealthcheckResult = {
  connector: "recruitee";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "recruitee", status: "ok", source: "connector" };
}
