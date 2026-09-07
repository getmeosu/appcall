/**
 * Webhook connector — normalized types.
 *
 * The Webhook connector handles incoming webhook events from arbitrary
 * external systems and normalizes them into a standard event shape.
 */

export type NormalizedEvent = {
  id: string;
  provider: "webhook";
  eventType: string;
  source: string;
  payload: unknown;
  headers: Record<string, string>;
  receivedAt: string;
  raw: unknown;
};

/**
 * Normalize an incoming webhook event.
 *
 * @param opts.id        - Unique event id (falls back to "webhook-evt:<timestamp>").
 * @param opts.eventType - The event type (e.g. "push", "payment.completed").
 * @param opts.source    - Identifier for the originating system.
 * @param opts.payload   - The parsed request body.
 * @param opts.headers   - HTTP headers from the incoming request.
 */
export function normalizeEvent(opts: {
  id?: string;
  eventType: string;
  source: string;
  payload?: unknown;
  headers?: Record<string, string>;
}): NormalizedEvent {
  return {
    id: opts.id ?? `webhook-evt:${Date.now()}`,
    provider: "webhook",
    eventType: opts.eventType,
    source: opts.source,
    payload: opts.payload ?? null,
    headers: opts.headers ?? {},
    receivedAt: new Date().toISOString(),
    raw: opts.payload ?? null,
  };
}

/**
 * Extract a likely event type from common webhook conventions.
 *
 * Checks common header keys (X-Event, X-Event-Type, X-GitHub-Event, etc.)
 * and falls back to the "event" query-string-like key in the payload.
 */
export function detectEventType(
  headers: Record<string, string>,
  payload: unknown,
): string {
  // Common header conventions
  const headerCandidates = [
    "x-event",
    "x-event-type",
    "x-github-event",
    "x-stripe-event",
    "x-webhook-event",
    "ce-type", // CloudEvents
  ];

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  for (const key of headerCandidates) {
    if (lowerHeaders[key]) return lowerHeaders[key];
  }

  // Check payload for an "event" or "type" field
  if (isRecord(payload)) {
    if (typeof payload.event === "string") return payload.event;
    if (typeof payload.type === "string") return payload.type;
  }

  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
