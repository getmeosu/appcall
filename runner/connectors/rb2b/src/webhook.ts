import { parseVisitorWebhook } from "./objects";
import type { NormalizedVisitor } from "./objects";
import { prop, isRecord } from "./http";

// ---------------------------------------------------------------------------
// Webhook ingestion contract
//
// The control plane (Go) calls the runner's `connector.webhook.parse` and
// `connector.webhook.verify` RPCs. parse() must return the connector-owned
// idempotency key, an optional sync operation, and a sanitized payload safe to
// persist. verify() must prove the delivery is authentic before the platform
// trusts it.
// ---------------------------------------------------------------------------

export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: NormalizedVisitor | Record<string, unknown>;
};

// deriveIdempotencyKey returns a stable key that dedupes identical RB2B
// deliveries. RB2B may include an explicit event identifier; when absent we
// compose the visitor identity with the visit timestamp so repeat visits are
// distinct events while a redelivery of the same event collapses.
function deriveIdempotencyKey(payload: Record<string, unknown>, visitor: NormalizedVisitor): string {
  const explicit = prop(payload, "event_id") || prop(payload, "id");
  if (explicit) return `rb2b-wh:${explicit}`;
  const stamp = visitor.visitedAt || "";
  return `rb2b-wh:${visitor.id}${stamp ? `:${stamp}` : ""}`;
}

// parseWebhook normalizes a raw RB2B visitor-identified payload into the
// platform's ParsedWebhook shape. The sanitized payload is the NormalizedVisitor
// (no credentials/secrets are ever part of an RB2B visitor body, so it is safe
// to persist as-is).
export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) {
    return {
      idempotencyKey: "rb2b-wh:unknown",
      operation: "webhook.visitor_identified",
      sanitized: {},
    };
  }
  const visitor = parseVisitorWebhook(payload);
  return {
    idempotencyKey: deriveIdempotencyKey(payload, visitor),
    operation: "webhook.visitor_identified",
    sanitized: visitor,
  };
}

// verifyWebhook proves an inbound RB2B delivery is authentic.
//
// RB2B does not publish an HMAC signing scheme; its push model relies on a
// per-destination secret token. When a secret is configured we require it to
// match the token RB2B echoes back (in the `x-rb2b-token` / `x-rb2b-signature`
// header or a `secret`/`token` field in the body). When no secret is configured
// the delivery is accepted, matching RB2B's default unsigned webhook behavior.
export function verifyWebhook(
  payload: unknown,
  headers: Record<string, string> = {},
  secret?: string,
): boolean {
  if (!secret) return true;

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;

  const presented =
    lowerHeaders["x-rb2b-token"] ??
    lowerHeaders["x-rb2b-signature"] ??
    (isRecord(payload) ? (prop(payload, "secret") || prop(payload, "token")) : "");

  return presented.length > 0 && timingSafeEqual(presented, secret);
}

// timingSafeEqual compares two strings without short-circuiting on the first
// differing byte, avoiding a timing side channel on the shared secret.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
