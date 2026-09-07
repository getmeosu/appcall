export type HealthcheckResult = {
  connector: "slack";
  status: "ok";
  source: "connector";
};

export function healthcheck(): HealthcheckResult {
  return {
    connector: "slack",
    status: "ok",
    source: "connector",
  };
}
