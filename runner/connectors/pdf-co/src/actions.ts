import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function httpClient(input: Record<string, unknown>, timeoutMs: number, maxResponseBytes: number) {
  return createConnectorHttpClient({
    allowedHosts: (manifest.network.allowedHosts as string[]) ?? [],
    maxResponseBytes,
    timeoutMs,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
  });
}

function fail(status: number, body: string, headers: Record<string, string>, parsed: unknown): never {
  if (status === 429) {
    const retry = Number(headers["retry-after"] ?? "30");
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "PDF.co rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) ? retry : 30,
    };
  }
  let message = "PDF.co request failed.";
  if (isRecord(parsed)) {
    for (const key of ["message", "Message", "error", "Error"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) {
        message = value;
        break;
      }
    }
  } else if (body.trim()) {
    message = body.slice(0, 300);
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function parseJson(body: string): unknown {
  if (!body.trim()) {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned an empty response." };
  }
  try {
    return JSON.parse(body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function assertValid(operation: string, input: Record<string, unknown>): void {
  const rest: Record<string, unknown> = { ...input };
  delete rest.apiKey;
  delete rest.fetch;
  try {
    compiled.actions[operation]!(rest);
  } catch (error) {
    throw {
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: error instanceof Error ? error.message : "Action input is invalid.",
    };
  }
}

async function pdfCoRequest(
  input: Record<string, unknown>,
  action: string,
  method: string,
  url: string,
  body: string | undefined,
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<Record<string, unknown>> {
  const client = httpClient(input, timeoutMs, maxResponseBytes);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-api-key": String(input.apiKey),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await client.fetchText(url, { method, headers, body });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  const parsed = parseJson(response.body);
  if (response.status !== 200) fail(response.status, response.body, response.headers, parsed);
  if (isRecord(parsed) && parsed.error === true) fail(response.status, response.body, response.headers, parsed);
  return { connector: "pdf-co", action, source: "provider", data: parsed };
}

function fileToBase64(file: unknown): { file: string; name?: string } {
  if (typeof file === "string" && file.length > 0) return { file };
  if (isRecord(file)) {
    for (const key of ["file", "data", "content", "base64", "body"]) {
      if (typeof file[key] === "string" && file[key]) {
        return {
          file: file[key] as string,
          name: typeof file.name === "string" ? file.name : undefined,
        };
      }
    }
  }
  throw {
    ok: false,
    code: "INVALID_ACTION_INPUT",
    message: "file must be a base64 string or an object with file, data, or content.",
  };
}

export async function fileUpload(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input) || typeof input.apiKey !== "string") {
    return compiled.actions["file.upload"]!(input) as Promise<Record<string, unknown>>;
  }
  assertValid("file.upload", input);
  const url = typeof input.url === "string" && input.url ? input.url : undefined;
  const hasFile = present(input.file);
  if (!url && !hasFile) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "url or file is required" };
  }
  if (url) {
    const target = new URL("https://api.pdf.co/v1/file/upload/url");
    target.searchParams.set("url", url);
    if (typeof input.name === "string" && input.name) target.searchParams.set("name", input.name);
    return pdfCoRequest(input, "file.upload", "GET", target.toString(), undefined, 15000, 1048576);
  }
  const encoded = fileToBase64(input.file);
  const body: Record<string, unknown> = { file: encoded.file };
  if (typeof input.name === "string" && input.name) body.name = input.name;
  else if (encoded.name) body.name = encoded.name;
  return pdfCoRequest(
    input,
    "file.upload",
    "POST",
    "https://api.pdf.co/v1/file/upload/base64",
    JSON.stringify(body),
    15000,
    1048576,
  );
}

function imagePath(format: unknown): string {
  const value = String(format ?? "PNG").toLowerCase();
  if (value === "jpg" || value === "jpeg") return "/v1/pdf/convert/to/jpg";
  if (value === "tiff" || value === "tif") return "/v1/pdf/convert/to/tiff";
  return "/v1/pdf/convert/to/png";
}

export async function pdfConvertToImage(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input) || typeof input.apiKey !== "string") {
    return compiled.actions["pdf.convert.to.image"]!(input) as Promise<Record<string, unknown>>;
  }
  assertValid("pdf.convert.to.image", input);
  if (typeof input.url !== "string" || !input.url) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "url is required" };
  }
  const body: Record<string, unknown> = { url: input.url };
  for (const key of ["dpi", "async", "pages", "password", "profiles"] as const) {
    if (present(input[key])) body[key] = input[key];
  }
  return pdfCoRequest(
    input,
    "pdf.convert.to.image",
    "POST",
    `https://api.pdf.co${imagePath(input.imageFormat)}`,
    JSON.stringify(body),
    30000,
    5242880,
  );
}

export const actions: Record<string, (input: unknown) => unknown> = { ...compiled.actions };
actions["file.upload"] = fileUpload;
actions["pdf.convert.to.image"] = pdfConvertToImage;

export const healthcheck = actions.healthcheck!;
