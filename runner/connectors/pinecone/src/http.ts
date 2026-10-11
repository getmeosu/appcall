import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import { isRecord, renderPath, renderTemplate } from "../../../bun/src/declarative/template";
import manifest from "../manifest.json";

export const pineconeAllowedHosts = manifest.network.allowedHosts as string[];
const apiVersion = (manifest.http.headers as Record<string, string>)["X-Pinecone-Api-Version"] ?? "2026-04";

export function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

export function pineconeHost(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") invalidInput(`${label} is required`);
  const raw = value.trim();
  let parsed: URL;
  try {
    parsed = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
  } catch {
    invalidInput(`${label} must be a valid host`);
  }
  if (parsed.protocol !== "https:") invalidInput(`${label} must use https`);
  if (parsed.username || parsed.password) invalidInput(`${label} must not include credentials`);
  const host = parsed.hostname.toLowerCase();
  if (host === "pinecone.io" || !host.endsWith(".pinecone.io") || host.includes("..")) {
    invalidInput(`${label} must be a pinecone.io subdomain`);
  }
  return `https://${host}`;
}

export function hostValue(input: Record<string, unknown>, field: string): unknown {
  if (input[field] !== undefined) return input[field];
  if (field === "indexHost") return input.index_host;
  if (field === "index_host") return input.indexHost;
  if (field === "assistant_host") return input.assistantHost;
  return undefined;
}

export function pineconeHeaders(
  apiKey: string,
  extra: Record<string, unknown> | undefined,
  input: Record<string, unknown>,
  hasJsonBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Api-Key": apiKey,
    "X-Pinecone-Api-Version": typeof input.api_version === "string" && input.api_version.length > 0
      ? input.api_version
      : apiVersion,
  };
  const rendered = renderTemplate(extra ?? {}, input);
  if (isRecord(rendered)) {
    for (const [key, value] of Object.entries(rendered)) {
      headers[key] = typeof value === "object" ? JSON.stringify(value) : String(value);
    }
  }
  if (hasJsonBody && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return headers;
}

export function appendRenderedQuery(url: URL, template: Record<string, unknown> | undefined, input: Record<string, unknown>): void {
  const rendered = renderTemplate(template ?? {}, input);
  if (!isRecord(rendered)) return;
  for (const [key, value] of Object.entries(rendered)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
}

export function renderPineconePath(path: string, input: Record<string, unknown>): string {
  return renderPath(path, input);
}

export function createPineconeClient(options: {
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}) {
  const client = createConnectorHttpClient({
    allowedHosts: pineconeAllowedHosts,
    maxResponseBytes: options.maxResponseBytes ?? 5_242_880,
    timeoutMs: options.timeoutMs ?? 15_000,
    fetch: options.fetch,
  });
  return {
    async fetchText(url: string | URL, init: RequestInit) {
      try {
        return await client.fetchText(url, init);
      } catch (error) {
        if (error instanceof ConnectorHttpError) {
          throw { ok: false, code: error.code, message: error.message };
        }
        throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
      }
    },
  };
}

export function upstreamFailure(status: number, body: string, retryAfter?: string): never {
  if (status === 429) {
    const retryAfterSeconds = Number(retryAfter ?? "30");
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Pinecone rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 30,
    };
  }
  let message = `Pinecone request failed with status ${status}.`;
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: { message?: unknown } };
    if (typeof parsed.message === "string" && parsed.message) message = parsed.message;
    else if (typeof parsed.error?.message === "string" && parsed.error.message) message = parsed.error.message;
  } catch {
    if (body.trim()) message = body.trim().slice(0, 500);
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

export { isRecord };
