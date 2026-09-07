export type HealthcheckResult = {
  connector: "smartrecruiters";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "smartrecruiters", status: "ok", source: "connector" };
}
