export type HealthcheckResult = {
  connector: "greenhouse";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "greenhouse", status: "ok", source: "connector" };
}
