import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const bulkMaxBytes = 10 * 1024 * 1024;

type FetchFn = typeof fetch;

type FileInput = {
  name: string;
  content: string;
  mimetype?: string;
};

type BulkInput = {
  apiKey: string;
  file: FileInput;
  email?: string;
  fetch?: FetchFn;
};

export function bulkCreateImages(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateBulk(inputValue);
  const form = new FormData();
  const bytes = encodeFileContent(input.file.content);
  form.append("file", new Blob([bytes], { type: input.file.mimetype ?? "text/csv" }), input.file.name);
  if (input.email !== undefined) form.append("email", input.email);
  return sendMultipart(input, form);
}

function sendMultipart(input: BulkInput, form: FormData): Promise<Record<string, unknown>> {
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)["images.bulk_create"];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 1048576,
    timeoutMs: operation.timeoutMs ?? 60000,
    fetch: input.fetch,
  });
  return client.fetchText(new URL("https://alttext.ai/api/v1/images/bulk_create"), {
    method: "POST",
    headers: {
      "X-API-Key": input.apiKey,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => finish(response)).catch((error) => {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw error;
  });
}

function finish(response: { status: number; headers: Record<string, string>; body: string }): Record<string, unknown> {
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "AltText.ai rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: upstreamMessage(response.body) ?? `AltText.ai rejected images.bulk_create (HTTP ${response.status}).`,
    };
  }
  return {
    connector: "alt-text-ai",
    action: "images.bulk_create",
    source: "provider",
    data: parseResponse(response.body),
  };
}

function validateBulk(value: unknown): BulkInput {
  if (!isRecord(value) || typeof value.apiKey !== "string" || value.apiKey.length === 0) {
    return invalidInput("Provide file.name and file.content.");
  }
  const file = asFile(value.file, bulkMaxBytes);
  if (!file) return invalidInput("Provide file.name and file.content.");
  if (value.email !== undefined && (typeof value.email !== "string" || value.email.length === 0)) {
    return invalidInput("email must be a non-empty string.");
  }
  return {
    apiKey: value.apiKey,
    file,
    email: typeof value.email === "string" ? value.email : undefined,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
  };
}

function asFile(value: unknown, maxBytes: number): FileInput | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.name !== "string"
    || value.name.length === 0
    || value.name.length > 255
    || /[\u0000\r\n]/.test(value.name)
  ) {
    return undefined;
  }
  if (typeof value.content !== "string" || value.content.length === 0) return undefined;
  if (
    value.mimetype !== undefined
    && (typeof value.mimetype !== "string" || value.mimetype.length === 0 || value.mimetype.length > 255 || /[\u0000\r\n]/.test(value.mimetype))
  ) {
    return undefined;
  }
  const bytes = encodeFileContent(value.content);
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return undefined;
  return {
    name: value.name,
    content: value.content,
    mimetype: typeof value.mimetype === "string" ? value.mimetype : undefined,
  };
}

function encodeFileContent(value: string): Uint8Array {
  const compact = value.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0 && compact.length >= 4) {
    try {
      const binary = atob(compact);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      if (bytes.byteLength > 0) return bytes;
    } catch {
      // Fall through to UTF-8 encoding of the original string.
    }
  }
  return new TextEncoder().encode(value);
}

function parseResponse(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { text: trimmed.slice(0, 4096) };
  }
}

function upstreamMessage(body: string): string | undefined {
  const parsed = parseResponse(body);
  if (!isRecord(parsed)) return undefined;
  for (const key of ["error", "message"]) {
    const value = parsed[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}
