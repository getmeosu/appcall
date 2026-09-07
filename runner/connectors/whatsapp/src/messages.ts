import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const defaultGraphVersion = "v25.0";

export type WhatsAppSendMessageInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  text: string;
};

export type WhatsAppNormalizedMessage = {
  id: string;
  provider: "whatsapp";
  providerMessageId: string;
  channelId: string;
  senderId: string;
  text: string;
  modelVersion: "2026-05-14";
  raw: Record<string, unknown>;
};

export type ConnectorErrorCode =
  | "CONNECTOR_RATE_LIMITED"
  | "CONNECTOR_UPSTREAM_ERROR";

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryAfterSeconds?: number;
  providerError?: string;
};

export type WhatsAppSendMessageResult =
  | { ok: true; message: WhatsAppNormalizedMessage }
  | { ok: false; error: ConnectorError };

export type WhatsAppMessagesClient = {
  send(input: unknown): Promise<WhatsAppSendMessageResult>;
};

export type WhatsAppMessagesClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export function createWhatsAppMessagesClient(options: WhatsAppMessagesClientOptions): WhatsAppMessagesClient {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (accessToken.length === 0) {
    throw new Error("accessToken is required");
  }
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.send"].maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async send(input: unknown): Promise<WhatsAppSendMessageResult> {
      const payload = validateSendMessageInput(input);
      const response = await httpClient.fetchText(`https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: payload.to,
          type: "text",
          text: { body: payload.text },
        }),
      });
      const body = readJsonObject(response.body);
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, error: mapWhatsAppError(response, body) };
      }

      const providerMessageId = readProviderMessageID(body);
      if (providerMessageId === "") {
        return {
          ok: false,
          error: {
            code: "CONNECTOR_UPSTREAM_ERROR",
            message: "WhatsApp returned an invalid message send response.",
          },
        };
      }
      return {
        ok: true,
        message: {
          id: `whatsapp:${payload.phoneNumberId}:${providerMessageId}`,
          provider: "whatsapp",
          providerMessageId,
          channelId: payload.phoneNumberId,
          senderId: payload.to,
          text: payload.text,
          modelVersion: "2026-05-14",
          raw: body,
        },
      };
    },
  };
}

export function validateSendMessageInput(input: unknown): WhatsAppSendMessageInput {
  if (!isRecord(input)) {
    throw new Error("send message input must be an object");
  }
  const graphVersion = typeof input.graphVersion === "string" && input.graphVersion.length > 0
    ? input.graphVersion.trim()
    : defaultGraphVersion;
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  const to = requireString(input.to, "to").trim();
  const text = requireString(input.text, "text").trim();
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("graphVersion must be a Graph API version like v25.0");
  }
  if (phoneNumberId.length === 0) {
    throw new Error("phoneNumberId is required");
  }
  if (to.length === 0) {
    throw new Error("to is required");
  }
  if (text.length === 0) {
    throw new Error("text is required");
  }
  if (text.length > 4096) {
    throw new Error("text exceeds WhatsApp text message limit");
  }
  return { graphVersion, phoneNumberId, to, text };
}

export function mapWhatsAppError(response: { status: number }, body: Record<string, unknown>): ConnectorError {
  const error = isRecord(body.error) ? body.error : {};
  const providerMessage = typeof error.message === "string" && error.message.length > 0
    ? error.message
    : undefined;
  const providerCode = typeof error.code === "number" ? error.code : undefined;
  if (response.status === 429 || providerCode === 130429 || providerCode === 131056) {
    return {
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      providerError: providerMessage,
    };
  }
  return {
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: "WhatsApp rejected the message send request.",
    providerError: providerMessage,
  };
}

function readProviderMessageID(body: Record<string, unknown>): string {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return "";
  }
  const message = body.messages[0];
  return isRecord(message) && typeof message.id === "string" ? message.id : "";
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const body = JSON.parse(bodyText);
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
