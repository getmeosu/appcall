export type HealthcheckResult = {
  connector: "hubspot";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "hubspot", status: "ok", source: "connector" };
}
