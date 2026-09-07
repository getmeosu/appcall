export type HealthcheckResult = {
  connector: "workable";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "workable", status: "ok", source: "connector" };
}
