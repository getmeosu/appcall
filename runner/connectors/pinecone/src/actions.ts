import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { renderTemplate } from "../../../bun/src/declarative/template";
import type { CompiledHandler } from "../../../bun/src/declarative/types";
import hosted from "./hosted.json";
import {
  appendRenderedQuery,
  createPineconeClient,
  hostValue,
  invalidInput,
  isRecord,
  pineconeHeaders,
  pineconeHost,
  renderPineconePath,
  upstreamFailure,
} from "./http";
import manifest from "../manifest.json";

type HostedSpec = { kind: "index" | "assistant"; field: string; encoding: "ndjson" | "multipart" | null };
type Operation = {
  timeoutMs?: number;
  maxResponseBytes?: number;
  inputSchema?: Record<string, unknown>;
  request?: {
    method?: string;
    path?: string;
    query?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    body?: unknown;
    success?: number[];
    result?: Record<string, unknown>;
  };
};

const operations = manifest.operations as Record<string, Operation>;
const credentialKeys = new Set(["apiKey", "fetch"]);

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uploadParts(input: Record<string, unknown>): { bytes: Uint8Array; fileName: string; contentType: string } {
  const file = isRecord(input.file) ? input.file : isRecord(input.file_content) ? input.file_content : {};
  const base64 = typeof input.file_content_base64 === "string"
    ? input.file_content_base64
    : typeof file.content === "string"
      ? file.content
      : typeof file.content_base64 === "string"
        ? file.content_base64
        : "";
  if (!base64) invalidInput("file_content_base64 is required");
  const fileName = typeof input.file_name === "string" && input.file_name
    ? input.file_name
    : typeof file.name === "string" && file.name
      ? file.name
      : "upload.bin";
  const contentType = typeof input.content_type === "string" && input.content_type
    ? input.content_type
    : typeof file.mimetype === "string" && file.mimetype
      ? file.mimetype
      : typeof file.type === "string" && file.type
        ? file.type
        : "application/octet-stream";
  return { bytes: decodeBase64(base64), fileName, contentType };
}

async function resolveHost(
  spec: HostedSpec,
  input: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch | undefined,
  operation: Operation,
): Promise<string> {
  const direct = hostValue(input, spec.field);
  if (direct !== undefined && direct !== "") {
    return pineconeHost(direct, spec.field);
  }
  if (spec.kind === "assistant" && typeof input.assistant_name === "string" && input.assistant_name) {
    const client = createPineconeClient({
      apiKey,
      fetch: fetchImpl,
      timeoutMs: operation.timeoutMs,
      maxResponseBytes: operation.maxResponseBytes,
    });
    const response = await client.fetchText(
      `https://api.pinecone.io/assistant/assistants/${encodeURIComponent(input.assistant_name)}`,
      { method: "GET", headers: pineconeHeaders(apiKey, undefined, input, false) },
    );
    if (response.status < 200 || response.status >= 300) {
      upstreamFailure(response.status, response.body, response.headers["retry-after"]);
    }
    const parsed = JSON.parse(response.body) as { host?: unknown };
    return pineconeHost(parsed.host, "assistant_host");
  }
  invalidInput(`${spec.field} is required`);
}

function executeHosted(key: string, spec: HostedSpec): CompiledHandler {
  const operation = operations[key];
  const request = operation?.request ?? {};
  return function hostedHandler(inputValue: unknown) {
    const record = isRecord(inputValue) ? inputValue : {};
    if (typeof record.apiKey !== "string") {
      validateStrictInput(record, operation?.inputSchema ?? { type: "object" }, credentialKeys);
      return { connector: "pinecone", action: key, source: "connector", validated: true };
    }
    let validated: Record<string, unknown>;
    try {
      validated = validateStrictInput(record, operation?.inputSchema ?? { type: "object" }, credentialKeys);
    } catch (error) {
      invalidInput(error instanceof Error ? error.message : "Action input is invalid.");
    }
    const input = { ...record, ...validated };
    const fetchImpl = typeof record.fetch === "function" ? record.fetch as typeof fetch : undefined;
    return (async () => {
      const baseUrl = await resolveHost(spec, input, record.apiKey, fetchImpl, operation ?? {});
      const path = renderPineconePath(request.path ?? "/", input);
      const url = new URL(`${baseUrl}${path}`);
      appendRenderedQuery(url, request.query, input);
      const client = createPineconeClient({
        apiKey: record.apiKey,
        fetch: fetchImpl,
        timeoutMs: operation?.timeoutMs,
        maxResponseBytes: operation?.maxResponseBytes,
      });
      const method = request.method ?? "GET";
      let body: string | FormData | undefined;
      const extraHeaders = { ...(request.headers ?? {}) };
      if (spec.encoding === "multipart") {
        const parts = uploadParts(input);
        const form = new FormData();
        form.append("file", new Blob([parts.bytes], { type: parts.contentType }), parts.fileName);
        body = form;
        delete extraHeaders["Content-Type"];
      } else if (spec.encoding === "ndjson") {
        const records = input.records;
        if (!Array.isArray(records)) invalidInput("records is required");
        body = records.map((item) => JSON.stringify(item)).join("\n");
        extraHeaders["Content-Type"] = "application/x-ndjson";
      } else if (request.body !== undefined && method !== "GET") {
        const rendered = renderTemplate(request.body, input);
        if (rendered !== undefined) body = JSON.stringify(rendered);
      }
      const hasJsonBody = typeof body === "string" && extraHeaders["Content-Type"] !== "application/x-ndjson";
      const headers = pineconeHeaders(record.apiKey, extraHeaders, input, Boolean(hasJsonBody && body));
      if (spec.encoding === "multipart") delete headers["Content-Type"];
      if (spec.encoding === "ndjson") headers["Content-Type"] = "application/x-ndjson";
      const response = await client.fetchText(url, { method, headers, body });
      const success = request.success ?? [200, 201, 202, 204];
      if (!success.includes(response.status)) {
        upstreamFailure(response.status, response.body, response.headers["retry-after"]);
      }
      if (request.result) {
        return { connector: "pinecone", action: key, source: "provider", ...request.result };
      }
      if (response.body.trim() === "") {
        return { connector: "pinecone", action: key, source: "provider", data: {} };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
      }
      return { connector: "pinecone", action: key, source: "provider", data: parsed };
    })();
  };
}

export function createPineconeActionHandlers(): Record<string, CompiledHandler> {
  const handlers: Record<string, CompiledHandler> = {};
  for (const [key, spec] of Object.entries(hosted as Record<string, HostedSpec>)) {
    handlers[key] = executeHosted(key, spec);
  }
  return handlers;
}

export function pineconeActions(compiled: Record<string, CompiledHandler>): Record<string, CompiledHandler> {
  return { ...compiled, ...createPineconeActionHandlers() };
}
