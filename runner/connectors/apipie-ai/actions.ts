import { ConnectorHttpError, createConnectorHttpClient } from "../../bun/src/http";
import manifest from "./manifest.json";

const uploadMaxBytes = 5 * 1024 * 1024;
const parseMaxBytes = 10 * 1024 * 1024;
const transcribeMaxBytes = 18 * 1024 * 1024;

type FetchFn = typeof fetch;

type FileInput = {
  name: string;
  content: string;
  mimetype?: string;
};

type UploadInput = {
  apiKey: string;
  file: FileInput;
  fetch?: FetchFn;
};

type ParseInput = UploadInput & {
  content?: boolean;
  metadata?: boolean;
};

type TranscribeInput = UploadInput & {
  model: "whisper-1" | "gpt-4o-transcribe" | "gpt-4o-mini-transcribe";
  prompt?: string;
  stream?: boolean;
  language?: string;
  temperature?: number;
  response_format?: "json" | "text" | "srt" | "verbose_json" | "vtt";
  timestamp_granularities?: Array<"word" | "segment">;
};

export function uploadFile(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateUpload(inputValue, uploadMaxBytes, "Provide file.name and file.content (5 MB maximum).");
  return sendMultipart({
    action: "files.upload",
    path: "/urlshare",
    input,
    form: fileForm(input.file),
    maxBytes: uploadMaxBytes,
  });
}

export function parseDocument(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateParse(inputValue);
  const form = fileForm(input.file);
  if (input.content !== undefined) form.append("content", String(input.content));
  if (input.metadata !== undefined) form.append("metadata", String(input.metadata));
  return sendMultipart({
    action: "documents.parse",
    path: "/v1/parser",
    input,
    form,
    maxBytes: parseMaxBytes,
  });
}

export function transcribeAudio(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateTranscribe(inputValue);
  const form = fileForm(input.file);
  form.append("model", input.model);
  if (input.prompt !== undefined) form.append("prompt", input.prompt);
  if (input.stream !== undefined) form.append("stream", String(input.stream));
  if (input.language !== undefined) form.append("language", input.language);
  if (input.temperature !== undefined) form.append("temperature", String(input.temperature));
  if (input.response_format !== undefined) form.append("response_format", input.response_format);
  for (const granularity of input.timestamp_granularities ?? []) {
    form.append("timestamp_granularities", granularity);
  }
  return sendMultipart({
    action: "audio.transcribe",
    path: "/v1/audio/transcriptions",
    input,
    form,
    maxBytes: transcribeMaxBytes,
  });
}

function sendMultipart(args: {
  action: string;
  path: string;
  input: UploadInput;
  form: FormData;
  maxBytes: number;
}): Promise<Record<string, unknown>> {
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[args.action];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs ?? 30000,
    fetch: args.input.fetch,
  });
  const url = new URL(`https://apipie.ai${args.path}`);
  return client.fetchText(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.input.apiKey}`,
      Accept: "application/json",
    },
    body: args.form,
  }).then((response) => finish(args.action, response)).catch((error) => {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw error;
  });
}

function finish(action: string, response: { status: number; headers: Record<string, string>; body: string }): Record<string, unknown> {
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "APIpie AI rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `APIpie AI rejected ${action} (HTTP ${response.status}).`,
    };
  }
  return {
    connector: "apipie-ai",
    action,
    source: "provider",
    data: parseResponse(response.body),
  };
}

function validateUpload(value: unknown, maxBytes: number, message: string): UploadInput {
  if (!isRecord(value) || typeof value.apiKey !== "string" || value.apiKey.length === 0) return invalidInput(message);
  const file = asFile(value.file, maxBytes);
  if (!file) return invalidInput(message);
  return {
    apiKey: value.apiKey,
    file,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
  };
}

function validateParse(value: unknown): ParseInput {
  const base = validateUpload(value, parseMaxBytes, "Provide file.name and file.content.");
  if (!isRecord(value)) return invalidInput("Provide file.name and file.content.");
  if (value.content !== undefined && typeof value.content !== "boolean") return invalidInput("content must be a boolean.");
  if (value.metadata !== undefined && typeof value.metadata !== "boolean") return invalidInput("metadata must be a boolean.");
  return {
    ...base,
    content: typeof value.content === "boolean" ? value.content : undefined,
    metadata: typeof value.metadata === "boolean" ? value.metadata : undefined,
  };
}

function validateTranscribe(value: unknown): TranscribeInput {
  const base = validateUpload(value, transcribeMaxBytes, "Provide file and model.");
  if (!isRecord(value)) return invalidInput("Provide file and model.");
  const models = ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"] as const;
  if (typeof value.model !== "string" || !models.includes(value.model as (typeof models)[number])) {
    return invalidInput("model must be whisper-1, gpt-4o-transcribe, or gpt-4o-mini-transcribe.");
  }
  if (value.prompt !== undefined && typeof value.prompt !== "string") return invalidInput("prompt must be a string.");
  if (value.stream !== undefined && typeof value.stream !== "boolean") return invalidInput("stream must be a boolean.");
  if (value.language !== undefined && typeof value.language !== "string") return invalidInput("language must be a string.");
  if (value.temperature !== undefined && (typeof value.temperature !== "number" || value.temperature < 0 || value.temperature > 1)) {
    return invalidInput("temperature must be a number between 0 and 1.");
  }
  const formats = ["json", "text", "srt", "verbose_json", "vtt"] as const;
  if (value.response_format !== undefined && (typeof value.response_format !== "string" || !formats.includes(value.response_format as (typeof formats)[number]))) {
    return invalidInput("response_format is invalid.");
  }
  let timestampGranularities: Array<"word" | "segment"> | undefined;
  if (value.timestamp_granularities !== undefined) {
    if (!Array.isArray(value.timestamp_granularities) || value.timestamp_granularities.some((item) => item !== "word" && item !== "segment")) {
      return invalidInput("timestamp_granularities must be word and/or segment.");
    }
    timestampGranularities = value.timestamp_granularities as Array<"word" | "segment">;
  }
  return {
    ...base,
    model: value.model as TranscribeInput["model"],
    prompt: typeof value.prompt === "string" ? value.prompt : undefined,
    stream: typeof value.stream === "boolean" ? value.stream : undefined,
    language: typeof value.language === "string" ? value.language : undefined,
    temperature: typeof value.temperature === "number" ? value.temperature : undefined,
    response_format: typeof value.response_format === "string" ? value.response_format as TranscribeInput["response_format"] : undefined,
    timestamp_granularities: timestampGranularities,
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

function fileForm(file: FileInput): FormData {
  const bytes = encodeFileContent(file.content);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: file.mimetype ?? "application/octet-stream" }), file.name);
  return form;
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
