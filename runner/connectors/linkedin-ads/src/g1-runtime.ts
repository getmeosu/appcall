// linkedin-ads G1 runtime helpers: per-op scope errors and id coercion.
//
// Local equivalent of the meta-ads / tiktok-ads (TT-0 runtime.ts) pattern.
// An operation that declares `requiredScopes` in the manifest maps a LinkedIn
// permission failure to CONNECTOR_CAPABILITY_MISSING:
//   - HTTP 403, or a body with code ACCESS_DENIED / serviceErrorCode 100
//     (LinkedIn's "Not enough permissions" envelope)
//     -> reason permission_missing, missingScopes, requiredScopes,
//        reconsentRequired: true;
//   - HTTP 429 -> CONNECTOR_RATE_LIMITED;
//   - everything else (a plain 400 / 422 validation error included)
//     -> CONNECTOR_UPSTREAM_ERROR.
// The runner wire format carries only code and message today (server.ts is
// oxide's SRV-ERR-1), so the message also names the scopes.

import manifest from "../manifest.json";
import { isRecord } from "./restli";

type Operation = { requiredScopes?: string[] };
const operations = manifest.operations as unknown as Record<string, Operation>;
const PROVIDER = "LinkedIn Ads";

export const PERMISSION_SERVICE_ERROR_CODE = 100;

export function requiredScopesFor(operation: string): string[] {
  const scopes = operations[operation]?.requiredScopes;
  return Array.isArray(scopes) ? [...scopes] : [];
}

export type LinkedInFailureKind = "permission_missing" | "rate_limited" | "upstream";

export function classifyLinkedInFailure(status: number, body: unknown): LinkedInFailureKind {
  if (status === 429) return "rate_limited";
  if (status === 403) return "permission_missing";
  if (isRecord(body) && (body.code === "ACCESS_DENIED" || body.serviceErrorCode === PERMISSION_SERVICE_ERROR_CODE)) {
    return "permission_missing";
  }
  return "upstream";
}

function retryAfter(headers: Record<string, string>): number {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "retry-after") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) return seconds;
    }
  }
  return 30;
}

export function liAdsFailure(operation: string, status: number, body: unknown, headers: Record<string, string> = {}): Error {
  const kind = classifyLinkedInFailure(status, body);
  const requiredScopes = requiredScopesFor(operation);
  if (kind === "permission_missing" && requiredScopes.length > 0) {
    return Object.assign(
      new Error(
        `${PROVIDER} permission missing for ${operation} (requires: ${requiredScopes.join(", ")}). ` +
          "Grant the scope to the app, make sure the member holds a matching ad-account role, and reconnect.",
      ),
      {
        code: "CONNECTOR_CAPABILITY_MISSING",
        reason: "permission_missing",
        status,
        missingScopes: requiredScopes,
        requiredScopes,
        reconsentRequired: true,
      },
    );
  }
  if (kind === "rate_limited") {
    return Object.assign(new Error(`${PROVIDER} rate limit exceeded.`), {
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: retryAfter(headers),
    });
  }
  return Object.assign(new Error(`${PROVIDER} rejected the ${operation} request.`), {
    code: "CONNECTOR_UPSTREAM_ERROR",
    status,
  });
}

const ACCOUNT_URN = "urn:li:sponsoredAccount:";

/**
 * Ad account id as declared in the schemas: a string of digits or
 * urn:li:sponsoredAccount:{digits}. A safe positive integer from a direct
 * (non-registry) caller is coerced to its digits. Returns the bare digits.
 */
export function adAccountId(value: unknown, field = "accountId"): string {
  const text = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
  if (typeof text !== "string") throw new Error(`${field} is required`);
  const trimmed = text.trim();
  const digits = trimmed.startsWith(ACCOUNT_URN) ? trimmed.slice(ACCOUNT_URN.length) : trimmed;
  if (!/^[0-9]{1,20}$/.test(digits)) throw new Error(`${field} must be digits or ${ACCOUNT_URN}{digits}`);
  return digits;
}

/** Numeric LinkedIn id with an optional URN prefix (campaign, campaign group, creative). */
export function numericId(value: unknown, field: string, urnPrefix: string): string {
  const text = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
  if (typeof text !== "string") throw new Error(`${field} is required`);
  const trimmed = text.trim();
  const digits = trimmed.startsWith(urnPrefix) ? trimmed.slice(urnPrefix.length) : trimmed;
  if (!/^[0-9]{1,20}$/.test(digits)) throw new Error(`${field} must be digits or ${urnPrefix}{digits}`);
  return digits;
}

/**
 * Observe field resolution for the Reconcile gets (campaign_groups.get,
 * campaigns.get, creatives.get). LinkedIn's default GET (no `fields`
 * projection) returns every field each update can change, so an observe always
 * uses the documented default and never forwards a caller `fields` value.
 * Returns the default field list the update's mutable inputs are checked against.
 */
export function resolveObserveFields(_input: unknown, defaults: readonly string[]): readonly string[] {
  return defaults;
}

/** Top-level fields in the documented 202609 default GET responses (no projection). */
export const CAMPAIGN_GROUP_OBSERVE_FIELDS = [
  "account", "backfilled", "changeAuditStamps", "id", "name", "runSchedule", "servingStatuses",
  "status", "test", "totalBudget", "allowedCampaignTypes",
] as const;
export const CAMPAIGN_OBSERVE_FIELDS = [
  "account", "associatedEntity", "audienceExpansionEnabled", "campaignGroup", "changeAuditStamps", "costType",
  "creativeSelection", "dailyBudget", "totalBudget", "id", "locale", "name", "offsiteDeliveryEnabled",
  "optimizationTargetType", "runSchedule", "servingStatuses", "status", "targetingCriteria", "test", "type",
  "unitCost", "version", "connectedTelevisionOnly", "politicalIntent",
] as const;
export const CREATIVE_OBSERVE_FIELDS = [
  "account", "campaign", "content", "createdAt", "createdBy", "id", "intendedStatus", "isServing", "isTest",
  "lastModifiedAt", "lastModifiedBy", "name", "servingHoldReasons",
] as const;
