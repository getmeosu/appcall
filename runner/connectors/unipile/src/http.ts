import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseUnipileRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

// Tokens in a Unipile/LinkedIn error body that mean the ACCOUNT is at risk —
// LinkedIn flagged it (checkpoint, captcha, 2FA/OTP, restriction) or the upstream
// session is dead (disconnected / expired credentials). These must quarantine the
// whole connection, never be retried, so the end user's real account is protected.
const RESTRICTION_TOKENS = [
  "checkpoint",
  "captcha",
  "in_app_validation",
  "phone_register",
  "2fa",
  "otp_",
  "account_restricted",
  "restricted",
  "suspended",
  "disconnected",
  "expired_credentials",
  "credentials_expired",
];

// Tokens that mean THIS specific action is not currently permitted (e.g. an invite
// cooldown). The connection is healthy; only this call is refused, so it is a
// per-action rejection, not a quarantine.
const ACTION_NOT_PERMITTED_TOKENS = [
  "cannot_resend_yet",
  "cannot_resend",
  "already_invited",
  "invitation_already",
  "already_connected",
];

// Stable connector error codes the runner emits. The Go control plane maps these
// to typed errors (CONNECTOR_ACCOUNT_RESTRICTED -> quarantine the connection;
// CONNECTOR_ACTION_NOT_PERMITTED -> reject just this action).
export const ConnectorErrorCode = {
  RateLimited: "CONNECTOR_RATE_LIMITED",
  AccountRestricted: "CONNECTOR_ACCOUNT_RESTRICTED",
  ActionNotPermitted: "CONNECTOR_ACTION_NOT_PERMITTED",
  UpstreamError: "CONNECTOR_UPSTREAM_ERROR",
} as const;

// collectErrorTokens gathers the lowercased string values from an error body
// (top level and one nested level) so we can match restriction/cooldown
// signatures regardless of which field (type/code/detail/title/message) Unipile
// uses for them.
function collectErrorTokens(body: unknown): string {
  if (typeof body === "string") return body.toLowerCase();
  if (!isRecord(body)) return "";
  const parts: string[] = [];
  for (const value of Object.values(body)) {
    if (typeof value === "string") parts.push(value);
    else if (isRecord(value)) {
      for (const inner of Object.values(value)) {
        if (typeof inner === "string") parts.push(inner);
      }
    }
  }
  return parts.join(" ").toLowerCase();
}

export type UnipileErrorClassification = { code: string; message: string; retryAfterSeconds?: number };

// classifyUnipileResponse maps a non-success Unipile response to a stable
// connector error code. Order matters: a rate-limit is transient; an account
// restriction is the worst case (quarantine); an action-not-permitted is a
// per-call refusal; everything else is a generic upstream error. Detection is
// body-token-first (the error TYPE), so it is robust to the exact HTTP status
// LinkedIn/Unipile chooses (checkpoints have surfaced as 403/408/422).
export function classifyUnipileResponse(status: number, headers: Record<string, string>, body: unknown): UnipileErrorClassification {
  const rl = parseUnipileRateLimit(status, headers);
  if (rl.limited) {
    return { code: ConnectorErrorCode.RateLimited, message: "Unipile rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  const tokens = collectErrorTokens(body);
  if (RESTRICTION_TOKENS.some((t) => tokens.includes(t))) {
    return {
      code: ConnectorErrorCode.AccountRestricted,
      message: "LinkedIn flagged this account (checkpoint/restriction). The connection is paused to protect it; reconnect required.",
    };
  }
  if (ACTION_NOT_PERMITTED_TOKENS.some((t) => tokens.includes(t)) || status === 422) {
    return {
      code: ConnectorErrorCode.ActionNotPermitted,
      message: "LinkedIn refused this action right now (e.g. invitation cooldown). Try again later or with a different target.",
    };
  }
  return { code: ConnectorErrorCode.UpstreamError, message: extractUpstreamReason(body) };
}

// extractUpstreamReason pulls a short, human-readable reason out of a Unipile
// error body (title / detail / message / type, in that order of usefulness) so a
// generic upstream failure is no longer swallowed into an opaque code. It returns
// only Unipile's OWN error text (never our request, apiKey, or dsn) and is length-
// capped so it stays safe to log and surface. Empty when the body carries nothing.
export function extractUpstreamReason(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 200).trim();
  if (!isRecord(body)) return "";
  for (const field of ["detail", "title", "message", "error_description", "type", "code"]) {
    const v = body[field];
    if (typeof v === "string" && v.trim() !== "") return v.slice(0, 200).trim();
  }
  return "";
}

export type UnipileClientOptions = { apiKey: string; baseUrl: string; fetch?: typeof fetch; operation?: string };

/**
 * Validate that the DSN hostname is in the connector's allowedHosts list.
 * Throws ConnectorHttpError OUTBOUND_HOST_NOT_ALLOWED if not.
 */
export function validateDsnHost(dsn: string): URL {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error("Invalid DSN URL: " + dsn);
  }
  const allowed = new Set((manifest.network.allowedHosts as string[]).map((h) => h.toLowerCase()));
  if (!allowed.has(url.hostname.toLowerCase())) {
    throw new Error(`DSN hostname "${url.hostname}" is not in the connector's allowedHosts list.`);
  }
  return url;
}

export function createUnipileClient(options: UnipileClientOptions) {
  const operation = options.operation ?? "accounts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const dsnUrl = validateDsnHost(options.baseUrl);
  const baseUrl = `${dsnUrl.protocol}//${dsnUrl.host}`.replace(/\/$/, "");
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${baseUrl}/api/v1${path}`, {
        ...init,
        headers: {
          "X-API-KEY": options.apiKey,
          "accept": "application/json",
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string>),
        },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type UnipileClient = ReturnType<typeof createUnipileClient>;

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number { const v = obj[field]; if (typeof v === "number") return v; if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : fallback; } return fallback; }
export function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
