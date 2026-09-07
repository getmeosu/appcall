export type HealthcheckResult = {
  connector: "google-ads";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return {
    connector: "google-ads",
    status: "ok",
    source: "connector",
  };
}
