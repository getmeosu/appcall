import { isRecord, prop } from "./http";

export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
};

const EVENT_OPERATIONS: Record<string, string> = {
  "invitee.created": "webhook.invitee_created",
  "invitee.canceled": "webhook.invitee_canceled",
  "routing_form_submission.created": "webhook.routing_form_submission",
};

function payloadRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.payload) ? payload.payload : {};
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) {
    return {
      idempotencyKey: "calendly-wh:unknown",
      operation: "webhook.invitee_created",
      sanitized: {},
    };
  }
  const event = prop(payload, "event");
  const inner = payloadRecord(payload);
  const uri = prop(inner, "uri") || prop(payload, "uri");
  const operation = EVENT_OPERATIONS[event] ?? "webhook.invitee_created";
  const suffix = uri || prop(payload, "created_at") || "unknown";
  return {
    idempotencyKey: `calendly-wh:${event || "unknown"}:${suffix}`,
    operation,
    sanitized: event
      ? {
          event,
          uri,
          email: prop(inner, "email"),
          name: prop(inner, "name"),
          status: prop(inner, "status"),
          scheduledEvent: prop(inner, "event"),
        }
      : {},
  };
}
