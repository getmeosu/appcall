// Hand-written DocuSign calls the declarative request block cannot express:
// binary downloads, raw image and multipart uploads, and collection DELETEs
// whose OpenAPI operation requires a JSON body.

import { ConnectorHttpError, hostIsAllowed } from "../../../bun/src/http";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { isRecord, renderPath, renderTemplate } from "../../../bun/src/declarative/template";
import { normalizeSetupHost, SETUP_HOST_POLICIES } from "../../../bun/src/declarative/setup_fields";
import manifest from "../manifest.json";

type FetchFn = typeof fetch;

type Operation = {
  transport?: string;
  uploadField?: string;
  deleteBody?: unknown;
  maxResponseBytes?: number;
  timeoutMs?: number;
  inputSchema?: Record<string, unknown>;
  request?: {
    method?: string;
    path?: string;
    success?: number[];
    query?: Record<string, unknown>;
  };
};

const operations = manifest.operations as Record<string, Operation>;
const credentialKeys = new Set(["accessToken", "restHost", "oauthHost", "fetch"]);

export function isTransportOperation(key: string): boolean {
  return typeof operations[key]?.transport === "string";
}

export async function executeTransport(operationKey: string, inputValue: unknown): Promise<Record<string, unknown>> {
  const operation = operations[operationKey];
  if (!operation || typeof operation.transport !== "string" || !operation.request?.path || !operation.request.method) {
    throw rejected("INVALID_ACTION_INPUT", "Unknown DocuSign operation.");
  }
  if (!isRecord(inputValue)) throw rejected("INVALID_ACTION_INPUT", "Action input is invalid.");

  let validated: Record<string, unknown>;
  try {
    validated = validateStrictInput(inputValue, operation.inputSchema ?? { type: "object" }, credentialKeys);
  } catch (error) {
    throw rejected("INVALID_ACTION_INPUT", error instanceof Error ? error.message : "Action input is invalid.");
  }

  const accessToken = inputValue.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw rejected("INVALID_ACTION_INPUT", "accessToken is required");
  }
  // SEC-SETUP-1: the REST host must be a DocuSign host (docusign.net/.com).
  let restHost: string;
  try {
    restHost = normalizeSetupHost(inputValue.restHost, "restHost", SETUP_HOST_POLICIES.docusign!.restHost!);
  } catch {
    throw rejected("OUTBOUND_HOST_NOT_ALLOWED", "Outbound host is not allowed for this connector.");
  }
  if (!isDnsHost(restHost) || !hostIsAllowed(restHost, [restHost])) {
    throw rejected("OUTBOUND_HOST_NOT_ALLOWED", "Outbound host is not allowed for this connector.");
  }

  let path: string;
  try {
    path = renderPath(operation.request.path, validated);
  } catch (error) {
    throw rejected("INVALID_ACTION_INPUT", error instanceof Error ? error.message : "Action input is invalid.");
  }

  const url = new URL(`https://${restHost}/restapi/v2.1${path}`);
  const renderedQuery = renderTemplate(operation.request.query ?? {}, validated);
  if (isRecord(renderedQuery)) {
    for (const [key, value] of Object.entries(renderedQuery)) {
      if (value === undefined) continue;
      url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }

  const transport = operation.transport;
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  let body: string | undefined;
  if (transport === "binary-get") {
    headers.Accept = "*/*";
  } else if (transport === "binary-put") {
    headers.Accept = "application/json";
    const file = filePayload(validated, operation.uploadField);
    headers["Content-Type"] = file.contentType;
    body = file.bytesLatin1;
  } else if (transport === "multipart") {
    headers.Accept = "application/json";
    const file = filePayload(validated, operation.uploadField);
    const boundary = "appcalldocusignboundary";
    headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
    body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.fileName}"\r\nContent-Type: ${file.contentType}\r\n\r\n${file.bytesLatin1}\r\n--${boundary}--\r\n`;
  } else if (transport === "json-delete") {
    headers.Accept = "application/json";
    headers["Content-Type"] = "application/json";
    const rendered = renderTemplate(operation.deleteBody ?? {}, validated);
    body = JSON.stringify(rendered ?? {});
  } else if (transport === "raw-put") {
    headers.Accept = "application/json";
  } else {
    throw rejected("INVALID_ACTION_INPUT", "Unsupported DocuSign transport.");
  }

  const response = await callProvider(
    url,
    operation.request.method,
    headers,
    body,
    typeof inputValue.fetch === "function" ? (inputValue.fetch as FetchFn) : fetch,
    operation.timeoutMs ?? 15000,
    operation.maxResponseBytes ?? 5242880,
  );
  const success = new Set(operation.request.success ?? [200]);
  if (!success.has(response.status)) {
    throw failure(operationKey, response.status, response.headers, response.bytes);
  }
  if (transport === "binary-get") {
    const contentType = mediaType(response.headers.get("content-type")) ?? "application/octet-stream";
    return done(operationKey, {
      content_type: contentType,
      byte_length: response.bytes.byteLength,
      content_base64: Buffer.from(response.bytes).toString("base64"),
    });
  }
  const text = Buffer.from(response.bytes).toString("utf8").trim();
  if (text.length === 0) return done(operationKey, {});
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      throw rejected("CONNECTOR_RESPONSE_INVALID", "Connector returned invalid JSON.");
    }
    return done(operationKey, parsed);
  } catch (error) {
    if (isRejected(error)) throw error;
    throw rejected("CONNECTOR_RESPONSE_INVALID", "Connector returned invalid JSON.");
  }
}

function filePayload(validated: Record<string, unknown>, field: string | undefined): { contentType: string; fileName: string; bytesLatin1: string } {
  if (!field || !isRecord(validated[field])) throw rejected("INVALID_ACTION_INPUT", "Upload file is required");
  const file = validated[field] as Record<string, unknown>;
  if (typeof file.contentBase64 !== "string" || file.contentBase64.length === 0) {
    throw rejected("INVALID_ACTION_INPUT", "contentBase64 is required");
  }
  const contentType = typeof file.contentType === "string" && file.contentType.length > 0 ? file.contentType : "image/png";
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) throw rejected("INVALID_ACTION_INPUT", "contentType is invalid");
  const fileName = typeof file.fileName === "string" && file.fileName.length > 0 ? file.fileName.replace(/[\r\n"]/g, "") : "upload.bin";
  if (fileName.length === 0) throw rejected("INVALID_ACTION_INPUT", "fileName is invalid");
  return { contentType, fileName, bytesLatin1: Buffer.from(file.contentBase64, "base64").toString("latin1") };
}

async function callProvider(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  fetchImpl: FetchFn,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<{ status: number; headers: Headers; bytes: Uint8Array }> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new ConnectorHttpError("OUTBOUND_TIMEOUT", "Outbound request exceeded the connector HTTP timeout."));
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, { method, headers, body, redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      throw rejected("OUTBOUND_REDIRECT_BLOCKED", "Outbound redirects are blocked by the connector HTTP boundary.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxResponseBytes) {
      throw rejected("OUTBOUND_RESPONSE_TOO_LARGE", "Outbound response exceeded the configured byte limit.");
    }
    return { status: response.status, headers: response.headers, bytes };
  } catch (error) {
    if (isRejected(error)) throw error;
    if (controller.signal.aborted && controller.signal.reason instanceof ConnectorHttpError) {
      throw rejected(controller.signal.reason.code, controller.signal.reason.message);
    }
    if (error instanceof ConnectorHttpError) throw rejected(error.code, error.message);
    throw rejected("CONNECTOR_UNAVAILABLE", "Connector request failed.");
  } finally {
    clearTimeout(timer);
  }
}

function failure(operationKey: string, status: number, headers: Headers, bytes: Uint8Array): Record<string, unknown> {
  if (status === 429) {
    const retry = Number(headers.get("retry-after"));
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "DocuSign rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : 60,
    };
  }
  let message = `DocuSign rejected the ${operationKey} request.`;
  try {
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as Record<string, unknown>;
    for (const key of ["message", "errorCode", "error"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length > 0) {
        message = value.trim().slice(0, 400);
        break;
      }
    }
  } catch {
    // Non-JSON error bodies stay on the generic message.
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function done(operationKey: string, data: Record<string, unknown>): Record<string, unknown> {
  return { connector: "docusign", action: operationKey, source: "provider", data };
}

function rejected(code: string, message: string): Record<string, unknown> {
  return { ok: false, code, message };
}

function isRejected(error: unknown): error is { code: string } {
  return isRecord(error) && typeof error.code === "string";
}

function isDnsHost(host: string): boolean {
  return host.length > 0 && host.length <= 253 && /^[A-Za-z0-9.-]+$/.test(host) && !host.startsWith(".") && !host.endsWith(".") && !host.includes("..");
}

function mediaType(header: string | null): string | undefined {
  if (!header) return undefined;
  const value = header.split(";", 1)[0]?.trim().toLowerCase();
  return value && value.length > 0 ? value : undefined;
}
