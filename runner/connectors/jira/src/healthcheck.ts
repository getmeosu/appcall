export type HealthcheckResult = {
  connector: "jira";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "jira", status: "ok", source: "connector" };
}
