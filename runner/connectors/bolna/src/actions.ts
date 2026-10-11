import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const maxBatchBytes = 5 * 1024 * 1024;
const maxKnowledgebaseBytes = 20 * 1024 * 1024;

type FetchFn = typeof fetch;

type BatchInput = {
  apiKey: string;
  agent_id: string;
  fileName: string;
  contentBase64: string;
  contentType?: string;
  from_phone_number?: string;
  from_phone_numbers?: string[];
  retry_config?: string;
  webhook_url?: string;
  fetch?: FetchFn;
};

type KnowledgebaseInput = {
  apiKey: string;
  url?: string;
  fileName?: string;
  contentBase64?: string;
  contentType?: string;
  chunk_size?: number;
  overlapping?: number;
  similarity_top_k?: number;
  language_support?: string;
  user_id?: string;
  sub_account_id?: string;
  fetch?: FetchFn;
};

export function createBatch(inputValue: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateBatchInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[
    "batches.create"
  ];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs ?? 60000,
    fetch: input.fetch,
  });

  const bytes = decodeBase64(input.contentBase64, maxBatchBytes);
  const form = new FormData();
  form.append("agent_id", input.agent_id);
  form.append("file", new Blob([bytes], { type: input.contentType ?? "text/csv" }), input.fileName);
  if (input.from_phone_number) form.append("from_phone_number", input.from_phone_number);
  for (const number of input.from_phone_numbers ?? []) form.append("from_phone_numbers", number);
  if (input.retry_config) form.append("retry_config", input.retry_config);
  if (input.webhook_url) form.append("webhook_url", input.webhook_url);

  return client.fetchText(new URL("https://api.bolna.ai/batches"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => finish("batches.create", response, "Bolna rejected the batch upload"));
}

export function createKnowledgebase(
  inputValue: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  const input = validateKnowledgebaseInput(inputValue);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[
    "knowledgebases.create"
  ];
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs ?? 60000,
    fetch: input.fetch,
  });

  const form = new FormData();
  if (input.url) form.append("url", input.url);
  if (input.contentBase64 && input.fileName) {
    const bytes = decodeBase64(input.contentBase64, maxKnowledgebaseBytes);
    form.append("file", new Blob([bytes], { type: input.contentType ?? "application/pdf" }), input.fileName);
  }
  if (input.chunk_size !== undefined) form.append("chunk_size", String(input.chunk_size));
  if (input.overlapping !== undefined) form.append("overlapping", String(input.overlapping));
  if (input.similarity_top_k !== undefined) form.append("similarity_top_k", String(input.similarity_top_k));
  if (input.language_support) form.append("language_support", input.language_support);
  if (input.user_id) form.append("user_id", input.user_id);
  if (input.sub_account_id) form.append("sub_account_id", input.sub_account_id);

  return client.fetchText(new URL("https://api.bolna.ai/knowledgebase"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
    },
    body: form,
  }).then((response) => finish("knowledgebases.create", response, "Bolna rejected the knowledgebase create"));
}

function finish(
  action: string,
  response: { status: number; headers: Record<string, string>; body: string },
  message: string,
): Record<string, unknown> {
  const data = parseResponse(response.body);
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Bolna rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `${message} (HTTP ${response.status}).`,
    };
  }
  return {
    connector: "bolna",
    action,
    source: "connector",
    data,
  };
}

function validateBatchInput(value: unknown): BatchInput {
  if (!isRecord(value)) return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) {
    return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  }
  if (typeof value.agent_id !== "string" || value.agent_id.length === 0 || value.agent_id.length > 128) {
    return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  }
  if (
    typeof value.fileName !== "string"
    || value.fileName.length === 0
    || value.fileName.length > 255
    || /[\u0000\r\n]/.test(value.fileName)
  ) {
    return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  }
  if (typeof value.contentBase64 !== "string") {
    return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  }
  if (
    value.contentType !== undefined
    && (typeof value.contentType !== "string"
      || value.contentType.length > 255
      || !/^[\w.+-]+\/[\w.+-]+(?:\s*;[^\r\n]*)?$/.test(value.contentType))
  ) {
    return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  }
  const bytes = decodeBase64(value.contentBase64, maxBatchBytes);
  if (bytes.byteLength === 0) return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  const fromNumbers = value.from_phone_numbers;
  if (fromNumbers !== undefined && (!Array.isArray(fromNumbers) || fromNumbers.some((item) => typeof item !== "string" || item.length === 0))) {
    return invalidInput("Provide agent_id and a base64 CSV file (5 MB maximum).");
  }
  return {
    apiKey: value.apiKey,
    agent_id: value.agent_id,
    fileName: value.fileName,
    contentBase64: value.contentBase64,
    contentType: typeof value.contentType === "string" ? value.contentType : undefined,
    from_phone_number: typeof value.from_phone_number === "string" ? value.from_phone_number : undefined,
    from_phone_numbers: Array.isArray(fromNumbers) ? fromNumbers as string[] : undefined,
    retry_config: typeof value.retry_config === "string" ? value.retry_config : undefined,
    webhook_url: typeof value.webhook_url === "string" ? value.webhook_url : undefined,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
  };
}

function validateKnowledgebaseInput(value: unknown): KnowledgebaseInput {
  if (!isRecord(value)) return invalidInput("Provide a knowledgebase url or a base64 PDF (20 MB maximum), not both.");
  if (typeof value.apiKey !== "string" || value.apiKey.length === 0) {
    return invalidInput("Provide a knowledgebase url or a base64 PDF (20 MB maximum), not both.");
  }
  const hasUrl = typeof value.url === "string" && value.url.length > 0;
  const hasFile = typeof value.contentBase64 === "string" && typeof value.fileName === "string" && value.fileName.length > 0;
  if (hasUrl === hasFile) {
    return invalidInput("Provide a knowledgebase url or a base64 PDF (20 MB maximum), not both.");
  }
  if (hasFile) {
    if (/[\u0000\r\n]/.test(String(value.fileName)) || String(value.fileName).length > 255) {
      return invalidInput("Provide a knowledgebase url or a base64 PDF (20 MB maximum), not both.");
    }
    const bytes = decodeBase64(String(value.contentBase64), maxKnowledgebaseBytes);
    if (bytes.byteLength === 0) {
      return invalidInput("Provide a knowledgebase url or a base64 PDF (20 MB maximum), not both.");
    }
  }
  return {
    apiKey: value.apiKey,
    url: hasUrl ? String(value.url) : undefined,
    fileName: hasFile ? String(value.fileName) : undefined,
    contentBase64: hasFile ? String(value.contentBase64) : undefined,
    contentType: typeof value.contentType === "string" ? value.contentType : undefined,
    chunk_size: typeof value.chunk_size === "number" ? value.chunk_size : undefined,
    overlapping: typeof value.overlapping === "number" ? value.overlapping : undefined,
    similarity_top_k: typeof value.similarity_top_k === "number" ? value.similarity_top_k : undefined,
    language_support: typeof value.language_support === "string" ? value.language_support : undefined,
    user_id: typeof value.user_id === "string" ? value.user_id : undefined,
    sub_account_id: typeof value.sub_account_id === "string" ? value.sub_account_id : undefined,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
  };
}

function decodeBase64(value: string, maxBytes: number): Uint8Array {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return invalidInput("Provide valid base64 file contents.");
  }
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (btoa(binary) !== value) return invalidInput("Provide valid base64 file contents.");
    if (bytes.byteLength > maxBytes) return invalidInput("Provide valid base64 file contents.");
    return bytes;
  } catch {
    return invalidInput("Provide valid base64 file contents.");
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
  const retryAfter = Number(headers["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  return 30;
}

function invalidInput(message: string): never {
  throw {
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
