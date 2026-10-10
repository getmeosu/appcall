export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) {
    throw new Error("webhook payload must be an object");
  }
  const formResponse = isRecord(payload.form_response) ? payload.form_response : {};
  const eventType = typeof payload.event_type === "string" ? payload.event_type : "form_response";
  const eventId = typeof payload.event_id === "string" ? payload.event_id : "";
  const formId = typeof formResponse.form_id === "string" ? formResponse.form_id : "";
  const token = typeof formResponse.token === "string" ? formResponse.token : "";
  return {
    idempotencyKey: eventId || `${formId}:${token}:${eventType}`,
    operation: "webhook.form_response",
    sanitized: {
      eventId,
      eventType,
      formId,
      token,
      submittedAt: typeof formResponse.submitted_at === "string" ? formResponse.submitted_at : "",
      raw: payload,
    },
  };
}
