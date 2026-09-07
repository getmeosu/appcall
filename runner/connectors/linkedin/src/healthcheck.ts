export type HealthcheckResult = {
  connector: "linkedin";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "linkedin", status: "ok", source: "connector" };
}
