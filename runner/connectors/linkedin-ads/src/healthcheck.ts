export type HealthcheckResult = {
  connector: "linkedin-ads";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "linkedin-ads", status: "ok", source: "connector" };
}
