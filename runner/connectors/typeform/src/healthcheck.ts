export type HealthcheckResult = {
  connector: "typeform";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "typeform", status: "ok", source: "connector" };
}
