export type HealthcheckResult = {
  connector: "meta-ads";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "meta-ads", status: "ok", source: "connector" };
}
