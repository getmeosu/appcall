export type HealthcheckResult = {
  connector: "ashby";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "ashby", status: "ok", source: "connector" };
}
