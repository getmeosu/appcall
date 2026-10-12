import { createLinkedInAdsClient } from "./http";
import { isRecord } from "./restli";
import { scopedPermissionFailure } from "./g1-runtime";

export type HealthcheckResult = {
  connector: "linkedin-ads";
  status: "ok";
  source: "connector" | "provider";
};

export function healthcheck(input?: unknown): HealthcheckResult | Promise<HealthcheckResult> {
  const token = isRecord(input) && typeof input.accessToken === "string" ? input.accessToken : "";
  if (token.length === 0) {
    return { connector: "linkedin-ads", status: "ok", source: "connector" };
  }
  const fetchImpl = isRecord(input) && typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createLinkedInAdsClient({ accessToken: token, fetch: fetchImpl, operation: "healthcheck" })
    .fetchJSON("/rest/adAccounts?q=search&pageSize=1", { method: "GET", headers: { "X-RestLi-Method": "FINDER" } })
    .then((response) => {
      if (response.status === 429) {
        throw Object.assign(new Error("LinkedIn Ads rate limit exceeded."), { code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
      }
      if (response.status < 200 || response.status >= 300) {
        const permission = scopedPermissionFailure("healthcheck", response.status, response.body);
        if (permission) throw permission;
        throw Object.assign(new Error("LinkedIn Ads rejected the request."), { code: "CONNECTOR_UPSTREAM_ERROR" });
      }
      return { connector: "linkedin-ads", status: "ok", source: "provider" };
    });
}
