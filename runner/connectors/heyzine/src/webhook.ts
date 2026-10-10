export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: { data: Record<string, unknown> };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  const envelope = isRecord(payload) ? payload : {};
  const data = isRecord(envelope.data) ? envelope.data : envelope;
  const id = identifier(data.id_webhook);
  const date = identifier(data.date);
  const sanitizedData: Record<string, unknown> = {};

  for (const key of ["id_webhook", "date", "leads"] as const) {
    if (Object.hasOwn(data, key)) sanitizedData[key] = data[key];
  }

  return {
    idempotencyKey: `heyzine-wh:${id || date || "unknown"}`,
    operation: "webhooks.leads",
    sanitized: { data: sanitizedData },
  };
}
