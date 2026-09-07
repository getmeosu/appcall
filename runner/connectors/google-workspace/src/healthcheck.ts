export type HealthcheckResult = {
  connector: "google-workspace";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return {
    connector: "google-workspace",
    status: "ok",
    source: "connector",
  };
}
