export type HealthcheckResult = {
  connector: "tiktok-ads";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "tiktok-ads", status: "ok", source: "connector" };
}
