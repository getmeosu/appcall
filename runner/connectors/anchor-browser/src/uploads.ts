import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const maxUploadBytes = 18 * 1024 * 1024;

type UploadKind = "extension" | "agent" | "session";

type UploadInput = {
  apiKey: string;
  name?: string;
  session_id?: string;
  file_name?: string;
  file_content_base64?: string;
  content_type?: string;
  file?: Record<string, unknown>;
  fetch?: typeof fetch;
};

const operations = manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>;

export function uploadExtension(inputValue: unknown) {
  return upload("extension", "extensions.upload", inputValue, (input) => {
    if (typeof input.name !== "string" || input.name.length === 0) return invalidInput();
    return `${manifest.http.baseUrl}/v1/extensions`;
  });
}

export function uploadAgentFile(inputValue: unknown) {
  return upload("agent", "sessions.agent.files.upload", inputValue, (input) => {
    if (typeof input.session_id !== "string" || input.session_id.length === 0) return invalidInput();
    return `${manifest.http.baseUrl}/v1/sessions/${encodeURIComponent(input.session_id)}/agent/files`;
  });
}

export function uploadSessionFile(inputValue: unknown) {
  return upload("session", "sessions.uploads.create", inputValue, (input) => {
    if (typeof input.session_id !== "string" || input.session_id.length === 0) return invalidInput();
    return `${manifest.http.baseUrl}/v1/sessions/${encodeURIComponent(input.session_id)}/uploads`;
  });
}

function upload(
  kind: UploadKind,
  action: string,
  inputValue: unknown,
  urlFor: (input: UploadInput) => string,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateInput(kind, inputValue);
  const operation = operations[action];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation?.maxResponseBytes ?? 1048576,
    timeoutMs: operation?.timeoutMs ?? 60000,
    fetch: input.fetch,
  });
  const bytes = decodeBase64(input.file_content_base64!);
  const fileName = input.file_name
    ?? (typeof input.file?.name === "string" ? input.file.name : undefined)
    ?? (kind === "extension" ? "extension.zip" : "upload.bin");
  const contentType = input.content_type
    ?? (typeof input.file?.mimetype === "string" ? input.file.mimetype : undefined)
    ?? (typeof input.file?.type === "string" ? input.file.type : undefined)
    ?? "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), fileName);
  if (kind === "extension" && input.name) form.append("name", input.name);

  return client.fetchText(urlFor(input), {
    method: "POST",
    headers: {
      "anchor-api-key": input.apiKey,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => {
    const data = parseResponse(response.body);
    if (response.status === 429) {
      throw {
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        message: "Anchor Browser rate limit exceeded while uploading a file.",
        retryAfterSeconds: retryAfterSeconds(response.headers),
      };
    }
    if (response.status < 200 || response.status >= 300) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: `Anchor Browser rejected the upload (HTTP ${response.status}).`,
      };
    }
    return { data };
  });
}

function validateInput(kind: UploadKind, value: unknown): UploadInput {
  if (!isRecord(value)) return invalidInput();
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput();
  const file = isRecord(value.file) ? value.file : undefined;
  let fileName = typeof value.file_name === "string" ? value.file_name : undefined;
  if (!fileName && file && typeof file.name === "string") fileName = file.name;
  let contentType = typeof value.content_type === "string" ? value.content_type : undefined;
  if (!contentType && file && typeof file.mimetype === "string") contentType = file.mimetype;
  if (!contentType && file && typeof file.type === "string") contentType = file.type;
  let encoded = typeof value.file_content_base64 === "string" ? value.file_content_base64 : undefined;
  if (!encoded && file && typeof file.contentBase64 === "string") encoded = file.contentBase64;
  if (!encoded) return invalidInput();
  const bytes = decodeBase64(encoded);
  if (bytes.byteLength === 0 || bytes.byteLength > maxUploadBytes) return invalidInput();
  if (fileName !== undefined && (fileName.length === 0 || fileName.length > 255 || /[\u0000\r\n]/.test(fileName))) {
    return invalidInput();
  }
  if (kind === "extension" && (typeof value.name !== "string" || value.name.length === 0)) return invalidInput();
  if ((kind === "agent" || kind === "session") && (typeof value.session_id !== "string" || value.session_id.length === 0)) {
    return invalidInput();
  }
  return {
    apiKey: value.apiKey,
    name: typeof value.name === "string" ? value.name : undefined,
    session_id: typeof value.session_id === "string" ? value.session_id : undefined,
    file_name: fileName,
    file_content_base64: encoded,
    content_type: contentType,
    file,
    fetch: typeof value.fetch === "function" ? value.fetch as typeof fetch : undefined,
  };
}

function decodeBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return invalidInput();
  }
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (btoa(binary) !== value) return invalidInput();
    return bytes;
  } catch {
    return invalidInput();
  }
}

function parseResponse(body: string): unknown {
  if (body.length === 0) return {};
  try {
    return JSON.parse(body);
  } catch {
    return { raw: body.slice(0, 4096) };
  }
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  return 30;
}

function invalidInput(): never {
  throw {
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message: "Provide valid upload fields (session_id or name, plus standard padded base64 file bytes).",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
