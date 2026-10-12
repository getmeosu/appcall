// `status` and `source` are the control plane's HealthcheckResponse contract
// (crates/appcall-runner-client); the runner, not the handler, names the connector.
export type HealthcheckResult = {
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return { status: "ok", source: "connector" };
}
