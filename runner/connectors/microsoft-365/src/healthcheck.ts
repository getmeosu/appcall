export type HealthcheckResult = {
  connector: "microsoft-365";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "microsoft-365", status: "ok", source: "connector" };
}
