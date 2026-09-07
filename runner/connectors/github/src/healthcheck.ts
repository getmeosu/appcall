export type HealthcheckResult = {
  connector: "github";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "github", status: "ok", source: "connector" };
}
