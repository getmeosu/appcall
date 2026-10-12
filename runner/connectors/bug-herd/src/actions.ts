import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const maxUploadBytes = 5 * 1024 * 1024;

type FetchFn = typeof fetch;

type UploadInput = {
  apiKey: string;
  project_id: number;
  task_id: number;
  file_name: string;
  file_content: string;
  content_type?: string;
  fetch?: FetchFn;
};

export function uploadAttachment(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateUploadInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[
    "attachments.upload"
  ];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs ?? 30000,
    fetch: input.fetch,
  });

  const bytes = encodeFileContent(input.file_content);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: input.content_type ?? "application/octet-stream" }), input.file_name);

  const url = new URL(
    `https://www.bugherd.com/api_v2/projects/${input.project_id}/tasks/${input.task_id}/attachments/upload`,
  );
  return client.fetchText(url, {
    method: "POST",
    headers: {
      Authorization: basicAuth(input.apiKey),
      Accept: "application/json",
    },
    body: form,
  }).then((response) => finish(response));
}

function finish(response: { status: number; headers: Record<string, string>; body: string }): Record<string, unknown> {
  const data = parseResponse(response.body);
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "BugHerd rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `BugHerd rejected the attachment upload (HTTP ${response.status}).`,
    };
  }
  return { data };
}

function validateUploadInput(value: unknown): UploadInput {
  if (!isRecord(value)) return invalidInput();
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput();
  const projectId = asPositiveInteger(value.project_id);
  const taskId = asPositiveInteger(value.task_id);
  if (projectId === undefined || taskId === undefined) return invalidInput();
  if (
    typeof value.file_name !== "string"
    || value.file_name.length === 0
    || value.file_name.length > 255
    || /[\u0000\r\n]/.test(value.file_name)
  ) {
    return invalidInput();
  }
  if (typeof value.file_content !== "string" || value.file_content.length === 0) return invalidInput();
  if (
    value.content_type !== undefined
    && (typeof value.content_type !== "string"
      || value.content_type.length === 0
      || value.content_type.length > 255
      || /[\u0000\r\n]/.test(value.content_type))
  ) {
    return invalidInput();
  }
  const bytes = encodeFileContent(value.file_content);
  if (bytes.byteLength === 0 || bytes.byteLength > maxUploadBytes) return invalidInput();
  return {
    apiKey: value.apiKey,
    project_id: projectId,
    task_id: taskId,
    file_name: value.file_name,
    file_content: value.file_content,
    content_type: typeof value.content_type === "string" ? value.content_type : undefined,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
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

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return undefined;
  return value;
}

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:x`, "utf8").toString("base64")}`;
}

function parseResponse(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(): never {
  throw {
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message: "Provide project_id, task_id, file_name, and file_content (5 MB maximum).",
  };
}
