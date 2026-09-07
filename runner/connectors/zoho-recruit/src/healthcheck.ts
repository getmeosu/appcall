export type HealthcheckResult = {
  connector: "zoho-recruit";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { connector: "zoho-recruit", status: "ok", source: "connector" };
}
