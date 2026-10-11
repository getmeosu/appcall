import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const stripeVersion = "2026-09-30.endive";
const filesHost = "files.stripe.com";
const maxUploadBytes = 15 * 1024 * 1024;

const purposes = [
  "account_requirement",
  "additional_verification",
  "business_icon",
  "business_logo",
  "customer_signature",
  "dispute_evidence",
  "document_provider_identity_document",
  "finance_report_run",
  "financial_account_statement",
  "identity_document",
  "identity_document_downloadable",
  "issuing_regulatory_reporting",
  "pci_document",
  "platform_terms_of_service",
  "selfie",
  "sigma_scheduled_query",
  "tax_document_user_upload",
  "terminal_android_apk",
  "terminal_reader_splashscreen",
  "terminal_wifi_certificate",
  "terminal_wifi_private_key",
] as const;

type FetchImpl = typeof fetch;

type BinaryInput = {
  apiKey: string;
  fetch?: FetchImpl;
};

export async function createFile(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = inputValue as Record<string, unknown>;
  const apiKey = requireApiKey(input);
  const purpose = requireEnum(input.purpose, purposes, "purpose");
  const fileName = requireFileName(input.file_name);
  const contentType = optionalContentType(input.content_type);
  const bytes = decodeBase64(input.content_base64);
  if (bytes.byteLength > maxUploadBytes) invalid("content_base64 exceeds the upload limit");
  const fileLinkCreate = optionalBoolean(input.file_link_create, "file_link_create");
  const fileLinkExpiresAt = optionalInteger(input.file_link_expires_at, "file_link_expires_at");
  rejectUnknown(input, ["purpose", "file_name", "content_base64", "content_type", "file_link_create", "file_link_expires_at"]);

  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([bytes], fileName, { type: contentType ?? "application/octet-stream" }));
  if (fileLinkCreate === true || fileLinkExpiresAt !== undefined) {
    form.append("file_link_data[create]", "true");
  }
  if (fileLinkExpiresAt !== undefined) {
    form.append("file_link_data[expires_at]", String(fileLinkExpiresAt));
  }

  const operation = operationBudget("files.create");
  const client = createConnectorHttpClient({
    allowedHosts: allowedHosts(),
    maxResponseBytes: operation.maxResponseBytes,
    timeoutMs: operation.timeoutMs,
    fetch: input.fetch as FetchImpl | undefined,
  });
  const response = await client.fetchText(new URL("https://files.stripe.com/v1/files"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Stripe-Version": stripeVersion,
    },
    body: form,
  });
  assertSuccess(response.status, response.headers, response.body, apiKey, "files.create");
  return {
    connector: "stripe",
    action: "files.create",
    source: "provider",
    data: parseJson(response.body),
  };
}

export async function downloadFileContents(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = inputValue as Record<string, unknown>;
  const apiKey = requireApiKey(input);
  const file = requireId(input.file, "file");
  rejectUnknown(input, ["file"]);
  return downloadBinary(
    input,
    apiKey,
    `https://files.stripe.com/v1/files/${file}/contents`,
    "files.contents",
  );
}

export async function downloadQuotePdf(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = inputValue as Record<string, unknown>;
  const apiKey = requireApiKey(input);
  const quote = requireId(input.quote, "quote");
  rejectUnknown(input, ["quote"]);
  return downloadBinary(
    input,
    apiKey,
    `https://files.stripe.com/v1/quotes/${quote}/pdf`,
    "quotes.pdf",
  );
}

export const binaryActions: Record<string, (input: unknown) => Promise<Record<string, unknown>>> = {
  "files.create": createFile,
  "files.contents": downloadFileContents,
  "quotes.pdf": downloadQuotePdf,
};

async function downloadBinary(input: Record<string, unknown>, apiKey: string, href: string, action: string): Promise<Record<string, unknown>> {
  const operation = operationBudget(action);
  const url = new URL(href);
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts().includes(url.hostname)) {
    throw { ok: false, code: "OUTBOUND_HOST_NOT_ALLOWED", message: "Outbound host is not allowed for this connector." };
  }
  const fetchImpl = (typeof input.fetch === "function" ? input.fetch : fetch) as FetchImpl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), operation.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "*/*",
        "Stripe-Version": stripeVersion,
      },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw { ok: false, code: "OUTBOUND_REDIRECT_BLOCKED", message: "Outbound redirects are blocked by the connector HTTP boundary." };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > operation.maxResponseBytes) {
      throw { ok: false, code: "OUTBOUND_RESPONSE_TOO_LARGE", message: "Outbound response exceeded the configured byte limit." };
    }
    const bodyText = new TextDecoder().decode(bytes);
    assertSuccess(response.status, Object.fromEntries(response.headers.entries()), bodyText, apiKey, action);
    return {
      connector: "stripe",
      action,
      source: "provider",
      contentBase64: Buffer.from(bytes).toString("base64"),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  } finally {
    clearTimeout(timer);
  }
}

function allowedHosts(): string[] {
  return (manifest.network as { allowedHosts: string[] }).allowedHosts;
}

function operationBudget(key: string): { maxResponseBytes: number; timeoutMs: number } {
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[key];
  return {
    maxResponseBytes: operation?.maxResponseBytes ?? 5242880,
    timeoutMs: operation?.timeoutMs ?? 15000,
  };
}

function assertSuccess(status: number, headers: Record<string, string>, body: string, apiKey: string, action: string): void {
  if (status === 429) {
    const retry = Number(headers["retry-after"] ?? headers["Retry-After"]);
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Stripe rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : 30,
    };
  }
  if (status < 200 || status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: safeError(body, apiKey, action),
    };
  }
}

function safeError(body: string, apiKey: string, action: string): string {
  let message = `Stripe rejected the ${action} request.`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    const detail = parsed.error?.message ?? parsed.message;
    if (typeof detail === "string" && detail.trim().length > 0 && detail.length <= 400 && !detail.includes("<")) {
      message = detail;
    }
  } catch {
    // Non-JSON failures stay generic so binary error pages are not echoed.
  }
  return message.split(apiKey).join("[redacted]");
}

function parseJson(body: string): unknown {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
    }
    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function requireApiKey(input: Record<string, unknown>): string {
  if (!input || typeof input !== "object") invalid("Action input is invalid.");
  if (typeof input.apiKey !== "string" || input.apiKey.length === 0) invalid("apiKey is required");
  return input.apiKey;
}

function rejectUnknown(input: Record<string, unknown>, allowed: string[]): void {
  const ok = new Set([...allowed, "apiKey", "fetch"]);
  for (const key of Object.keys(input)) {
    if (!ok.has(key)) invalid("Unsupported input field");
  }
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_]+$/.test(value)) invalid(`${name} is invalid`);
  return value;
}

function requireFileName(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 255 || /[\u0000\r\n"/\\]/.test(value)) {
    invalid("file_name is invalid");
  }
  return value;
}

function optionalContentType(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(value)) invalid("content_type is invalid");
  return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") invalid(`${name} is invalid`);
  return value;
}

function optionalInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) invalid(`${name} is invalid`);
  return value;
}

function requireEnum(value: unknown, allowed: readonly string[], name: string): string {
  if (typeof value !== "string" || !allowed.includes(value)) invalid(`${name} is invalid`);
  return value;
}

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) invalid("content_base64 is invalid");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) invalid("content_base64 is invalid");
  return new Uint8Array(Buffer.from(value, "base64"));
}

function invalid(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}
