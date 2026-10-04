const OPERATION = "webhook.message_received";

export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    const found = value.find(isRecord);
    return found;
  }
  return isRecord(value) ? value : undefined;
}

function extractInbound(payload: Record<string, unknown>): {
  messageId: string;
  from: string;
  phoneNumberId: string;
  type: string;
  text: string;
  timestamp: string;
} {
  const entry = firstRecord(payload.entry) ?? {};
  const change = firstRecord(entry.changes) ?? {};
  const value = isRecord(change.value) ? change.value : {};
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const message = firstRecord(value.messages) ?? {};
  const text = isRecord(message.text) && typeof message.text.body === "string" ? message.text.body : "";
  return {
    messageId: typeof message.id === "string" ? message.id : "",
    from: typeof message.from === "string" ? message.from : "",
    phoneNumberId: typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : "",
    type: typeof message.type === "string" ? message.type : "",
    text,
    timestamp: typeof message.timestamp === "string" ? message.timestamp : "",
  };
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) {
    return {
      idempotencyKey: "whatsapp-wh:unknown",
      operation: OPERATION,
      sanitized: {},
    };
  }
  const inbound = extractInbound(payload);
  return {
    idempotencyKey: `whatsapp-wh:${inbound.messageId || "unknown"}`,
    operation: OPERATION,
    sanitized: inbound,
  };
}
