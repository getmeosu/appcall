import { isRecord, prop } from "./http";

// ---------------------------------------------------------------------------
// Webhook ingestion contract
//
// The control plane (Go) calls the runner's `connector.webhook.parse` RPC. The
// parser must return a connector-owned idempotency key, an optional sync
// operation name, and a sanitized payload safe to persist. Apollo does NOT sign
// its reveal callbacks, so there is no `verifyWebhook` here — the registry
// treats a connector with no verifier as verified (see registry.verifyWebhook).
//
// This is the inbound side of Apollo's phone-number reveal: a people.match /
// people.bulk_match call with `reveal_phone_number: true` and a `webhook_url`
// causes Apollo to POST the revealed number to that URL asynchronously. Apollo
// echoes the matched person's id in the callback body, which is what lets the
// consumer (Sena) correlate the revealed phone back to its prospect.
// ---------------------------------------------------------------------------

export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
};

const OPERATION = "webhook.phone_revealed";

// extractPerson pulls the Apollo `person` object out of the callback envelope.
// Apollo has delivered the reveal under several shapes over time, so we accept
// the top-level object, a nested `person`, or the first entry of `people`.
function extractPerson(payload: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(payload.person)) return payload.person;
  if (Array.isArray(payload.people)) {
    const first = payload.people.find(isRecord);
    if (first) return first;
  }
  return payload;
}

// extractPersonId tolerantly reads the Apollo person id from the envelope or the
// person object. This id is the correlation key the consumer matches against the
// prospect id it stored when it first matched the person.
function extractPersonId(payload: Record<string, unknown>, person: Record<string, unknown>): string {
  return (
    prop(payload, "person_id") ||
    prop(person, "id") ||
    prop(person, "person_id") ||
    prop(payload, "id")
  );
}

// extractPhone tolerantly reads the revealed phone number. Apollo nests the
// number under `phone_numbers[0]` (preferring the sanitized E.164 form) but has
// also delivered a flat `phone` / `sanitized_number` / `raw_number` in some
// payloads, so we check each in priority order.
function extractPhone(payload: Record<string, unknown>, person: Record<string, unknown>): string {
  const numbers = Array.isArray(person.phone_numbers)
    ? person.phone_numbers
    : Array.isArray(payload.phone_numbers)
      ? payload.phone_numbers
      : [];
  for (const entry of numbers) {
    if (!isRecord(entry)) continue;
    const num = prop(entry, "sanitized_number") || prop(entry, "raw_number") || prop(entry, "number");
    if (num) return num;
  }
  return (
    prop(person, "sanitized_number") ||
    prop(person, "raw_number") ||
    prop(payload, "sanitized_number") ||
    prop(payload, "raw_number") ||
    prop(person, "phone") ||
    prop(payload, "phone")
  );
}

// deriveIdempotencyKey returns a stable key that collapses redeliveries of the
// same reveal. Apollo may include an explicit `id`/`event_id` on the envelope;
// when absent we compose the person id with the phone (or event id) so a repeat
// delivery of the same reveal dedupes while a genuinely new reveal is distinct.
function deriveIdempotencyKey(payload: Record<string, unknown>, personId: string, phone: string): string {
  const eventId = prop(payload, "event_id") || prop(payload, "webhook_id");
  const suffix = phone || eventId || prop(payload, "id") || "unknown";
  return `apollo-wh:${personId || "unknown"}:${suffix}`;
}

// parseWebhook normalizes a raw Apollo phone-reveal callback into the platform's
// ParsedWebhook shape. The sanitized payload carries only the correlation id and
// the revealed phone — no credentials are ever part of an Apollo reveal body, so
// it is safe to persist as-is.
export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) {
    return {
      idempotencyKey: "apollo-wh:unknown",
      operation: OPERATION,
      sanitized: {},
    };
  }
  const person = extractPerson(payload);
  const personId = extractPersonId(payload, person);
  const phone = extractPhone(payload, person);
  return {
    idempotencyKey: deriveIdempotencyKey(payload, personId, phone),
    operation: OPERATION,
    sanitized: { personId, phone },
  };
}
