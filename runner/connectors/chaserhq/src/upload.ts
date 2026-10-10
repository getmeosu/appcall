import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";

type UploadInput = Record<string, unknown> & {
  invoiceId: string;
  fileBase64: string;
  fileName?: string;
  apiKey?: string;
  apiSecret?: string;
  fetch?: typeof fetch;
};

type ConnectorFailure = {
  ok: false;
  code: string;
  message: string;
  retryAfterSeconds?: number;
};

const ACTION = "invoices.uploadPdf";
const API_BASE = "https://openapi.chaserhq.com";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_RETRY_AFTER_SECONDS = 3600;
const allowedInputKeys = new Set([
  "invoiceId", "fileBase64", "fileName", "apiKey", "apiSecret", "fetch",
]);

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw failure("INVALID_ACTION_INPUT", "Invoice PDF upload input must be an object.");
  }
  return input as Record<string, unknown>;
}

function failure(code: string, message: string, retryAfterSeconds?: number): ConnectorFailure {
  return {
    ok: false,
    code,
    message,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}

function validate(input: Record<string, unknown>): {
  invoiceId: string;
  fileName: string;
  fileBytes: Uint8Array;
  apiKey?: string;
  apiSecret?: string;
  fetch?: typeof fetch;
} {
  for (const key of Object.keys(input)) {
    if (!allowedInputKeys.has(key)) throw failure("INVALID_ACTION_INPUT", "Unsupported invoice PDF upload input field.");
  }

  const invoiceId = input.invoiceId;
  if (typeof invoiceId !== "string" || invoiceId.length === 0 || invoiceId.length > 128
    || invoiceId === "." || invoiceId === ".." || /[\/\\\u0000-\u001f\u007f]/.test(invoiceId)) {
    throw failure("INVALID_ACTION_INPUT", "invoiceId is invalid.");
  }

  const encoded = input.fileBase64;
  const maximumEncodedBytes = Math.ceil(MAX_PDF_BYTES / 3) * 4;
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > maximumEncodedBytes
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw failure("INVALID_ACTION_INPUT", "fileBase64 must contain a valid bounded base64 PDF.");
  }
  const fileBytes = Buffer.from(encoded, "base64");
  if (fileBytes.length === 0 || fileBytes.length > MAX_PDF_BYTES || fileBytes.toString("base64") !== encoded
    || new TextDecoder().decode(fileBytes.subarray(0, 5)) !== "%PDF-") {
    throw failure("INVALID_ACTION_INPUT", "fileBase64 must contain a valid bounded base64 PDF.");
  }

  const defaultName = `${invoiceId.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
  const fileName = input.fileName === undefined ? defaultName : input.fileName;
  if (typeof fileName !== "string" || fileName.length > 128
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,122}\.pdf$/i.test(fileName)) {
    throw failure("INVALID_ACTION_INPUT", "fileName must be a safe PDF filename.");
  }

  const apiKey = input.apiKey;
  const apiSecret = input.apiSecret;
  if ((apiKey === undefined) !== (apiSecret === undefined)
    || (apiKey !== undefined && (typeof apiKey !== "string" || apiKey.length === 0))
    || (apiSecret !== undefined && (typeof apiSecret !== "string" || apiSecret.length === 0))) {
    throw failure("INVALID_ACTION_INPUT", "Both Chaser API credentials are required.");
  }
  if (typeof apiKey === "string" && apiKey.includes(":")) {
    throw failure("INVALID_ACTION_INPUT", "Chaser API key cannot contain a colon.");
  }
  if (input.fetch !== undefined && typeof input.fetch !== "function") {
    throw failure("INVALID_ACTION_INPUT", "fetch must be a function when provided.");
  }

  return {
    invoiceId,
    fileName,
    fileBytes,
    ...(typeof apiKey === "string" ? { apiKey } : {}),
    ...(typeof apiSecret === "string" ? { apiSecret } : {}),
    ...(typeof input.fetch === "function" ? { fetch: input.fetch as typeof fetch } : {}),
  };
}

function retryDelay(headers: Record<string, string>): number {
  const raw = headers["retry-after"];
  if (raw && /^[0-9]{1,4}$/.test(raw)) {
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value > 0 && value <= MAX_RETRY_AFTER_SECONDS) return value;
  }
  return 30;
}

export function uploadInvoicePdf(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validate(asRecord(inputValue));
  if (input.apiKey === undefined || input.apiSecret === undefined) {
    return {
      connector: "chaserhq",
      action: ACTION,
      source: "connector",
      validated: { invoiceId: input.invoiceId, fileName: input.fileName },
    };
  }

  return upload(input);
}

async function upload(input: ReturnType<typeof validate>): Promise<Record<string, unknown>> {
  const auth = `Basic ${Buffer.from(`${input.apiKey}:${input.apiSecret}`, "utf8").toString("base64")}`;
  const form = new FormData();
  form.append("file", new Blob([input.fileBytes], { type: "application/pdf" }), input.fileName);
  const url = `${API_BASE}/v1/invoices/${encodeURIComponent(input.invoiceId)}/pdf`;
  const client = createConnectorHttpClient({
    allowedHosts: ["openapi.chaserhq.com"],
    maxResponseBytes: MAX_RESPONSE_BYTES,
    timeoutMs: 30_000,
    fetch: input.fetch,
  });

  let response;
  try {
    response = await client.fetchText(url, {
      method: "POST",
      headers: { authorization: auth, accept: "application/json" },
      body: form,
    });
  } catch (error) {
    const message = error instanceof ConnectorHttpError
      ? "Chaser invoice PDF upload could not be completed."
      : "Chaser invoice PDF upload could not be completed.";
    throw failure("CONNECTOR_UPSTREAM_ERROR", message);
  }

  if (response.status === 429) {
    throw failure("CONNECTOR_RATE_LIMITED", "Chaser rate limit exceeded.", retryDelay(response.headers));
  }
  if (response.status < 200 || response.status >= 300) {
    throw failure("CONNECTOR_UPSTREAM_ERROR", `Chaser rejected the invoice PDF upload (HTTP ${response.status}).`);
  }

  let data: unknown = {};
  if (response.body.trim() !== "") {
    try {
      data = JSON.parse(response.body);
    } catch {
      throw failure("CONNECTOR_RESPONSE_INVALID", "Chaser returned an invalid invoice PDF upload response.");
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw failure("CONNECTOR_RESPONSE_INVALID", "Chaser returned an invalid invoice PDF upload response.");
  }

  return { connector: "chaserhq", action: ACTION, source: "connector", data };
}
