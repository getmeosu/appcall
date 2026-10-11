// CSV ingest upload and ContentVersion VersionData are not declarative:
// raw bodies must be application/octet-stream, and fetchText is UTF-8.
import { ConnectorHttpError, createConnectorHttpClient, hostIsAllowed } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { parseSalesforceRateLimit } from "./http";

const ALLOWED_HOSTS = manifest.network.allowedHosts as string[];
const SALESFORCE_ID = /^[A-Za-z0-9]{15,18}$/;

type Budget = { timeoutMs: number; maxInputBytes: number; maxResponseBytes: number };

type Rejected = { ok: false; code: string; message: string; retryAfterSeconds?: number };

export async function uploadJobData(input: unknown): Promise<Record<string, unknown>> {
  const validated = validateUpload(input);
  if (!hasLiveCredentials(input)) {
    return { connector: "salesforce", action: "jobs.ingest_upload", source: "connector", validated };
  }
  return performUpload(input as Record<string, unknown>, validated);
}

export async function getFileContent(input: unknown): Promise<Record<string, unknown>> {
  const validated = validateFile(input);
  if (!hasLiveCredentials(input)) {
    return { connector: "salesforce", action: "files.version_data", source: "connector", validated };
  }
  return performDownload(input as Record<string, unknown>, validated);
}

function validateUpload(input: unknown): { jobId: string; csv: string } {
  const record = recordOf(input);
  const jobId = requiredId(record, "jobId");
  const csv = requiredString(record, "csv");
  const budget = budgetFor("jobs.ingest_upload");
  if (new TextEncoder().encode(csv).byteLength > budget.maxInputBytes) {
    throw rejected("INVALID_ACTION_INPUT", "csv exceeds maxInputBytes.");
  }
  return { jobId, csv };
}

function validateFile(input: unknown): { contentVersionId: string } {
  const record = recordOf(input);
  return { contentVersionId: requiredId(record, "contentVersionId") };
}

async function performUpload(input: Record<string, unknown>, validated: { jobId: string; csv: string }): Promise<Record<string, unknown>> {
  const origin = salesforceOrigin(input.instance_host);
  const budget = budgetFor("jobs.ingest_upload");
  const client = createConnectorHttpClient({
    allowedHosts: ALLOWED_HOSTS,
    maxResponseBytes: budget.maxResponseBytes,
    timeoutMs: budget.timeoutMs,
    fetch: fetchOf(input),
  });
  let response: { status: number; headers: Record<string, string> };
  try {
    response = await client.fetchText(`${origin}/services/data/v60.0/jobs/ingest/${validated.jobId}/batches`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
        "Content-Type": "text/csv",
      },
      body: validated.csv,
    });
  } catch (error) {
    throw transportError(error);
  }
  if (response.status !== 201) throw upstream("jobs.ingest_upload", response.status, response.headers);
  return { connector: "salesforce", action: "jobs.ingest_upload", source: "provider", data: null };
}

async function performDownload(input: Record<string, unknown>, validated: { contentVersionId: string }): Promise<Record<string, unknown>> {
  const origin = salesforceOrigin(input.instance_host);
  const budget = budgetFor("files.version_data");
  const url = `${origin}/services/data/v60.0/sobjects/ContentVersion/${validated.contentVersionId}/VersionData`;
  let response: { status: number; headers: Record<string, string>; bytes: Uint8Array };
  try {
    response = await fetchBytes(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "*/*",
      },
    }, budget, fetchOf(input) ?? fetch);
  } catch (error) {
    throw transportError(error);
  }
  if (response.status !== 200) throw upstream("files.version_data", response.status, response.headers);
  const contentType = mediaType(response.headers["content-type"]) ?? "application/octet-stream";
  return {
    connector: "salesforce",
    action: "files.version_data",
    source: "provider",
    data: {
      encoding: "base64",
      contentType,
      bytes: Buffer.from(response.bytes).toString("base64"),
    },
  };
}

function hasLiveCredentials(input: unknown): boolean {
  return isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function recordOf(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw rejected("INVALID_ACTION_INPUT", "Action input must be an object.");
  return input;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw rejected("INVALID_ACTION_INPUT", `${key} is required.`);
  }
  return value;
}

function requiredId(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!SALESFORCE_ID.test(value)) throw rejected("INVALID_ACTION_INPUT", `${key} must be a Salesforce id.`);
  return value;
}

function salesforceOrigin(host: unknown): string {
  if (typeof host !== "string" || host.length === 0) {
    throw rejected("INVALID_ACTION_INPUT", "instance_host is required.");
  }
  let url: URL;
  try {
    url = new URL(`https://${host}/`);
  } catch {
    throw rejected("OUTBOUND_INVALID_URL", "Outbound URL is invalid.");
  }
  if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || url.hostname !== host.toLowerCase()) {
    throw rejected("OUTBOUND_INVALID_URL", "Outbound URL is invalid.");
  }
  if (!hostIsAllowed(url.hostname, ALLOWED_HOSTS)) {
    throw rejected("OUTBOUND_HOST_NOT_ALLOWED", "Outbound host is not allowed for this connector.");
  }
  return url.origin;
}

function budgetFor(key: string): Budget {
  const spec = (manifest.operations as Record<string, Budget>)[key];
  if (!spec) throw rejected("CONNECTOR_UNAVAILABLE", "Connector operation is not declared.");
  return spec;
}

function fetchOf(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

async function fetchBytes(
  url: string,
  init: RequestInit,
  budget: Budget,
  fetchImpl: typeof fetch,
): Promise<{ status: number; headers: Record<string, string>; bytes: Uint8Array }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !hostIsAllowed(parsed.hostname, ALLOWED_HOSTS)) {
    throw rejected("OUTBOUND_HOST_NOT_ALLOWED", "Outbound host is not allowed for this connector.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget.timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      throw rejected("OUTBOUND_REDIRECT_BLOCKED", "Outbound redirects are blocked by the connector HTTP boundary.");
    }
    const bytes = await readBounded(response, budget.maxResponseBytes);
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), bytes };
  } catch (error) {
    if (isRejected(error)) throw error;
    if (controller.signal.aborted) {
      throw rejected("OUTBOUND_TIMEOUT", "Outbound request exceeded the connector HTTP timeout.");
    }
    throw rejected("CONNECTOR_UNAVAILABLE", "Connector request failed.");
  } finally {
    clearTimeout(timer);
  }
}

async function readBounded(response: Response, maxResponseBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) {
        await reader.cancel();
        throw rejected("OUTBOUND_RESPONSE_TOO_LARGE", "Outbound response exceeded the configured byte limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function mediaType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const media = value.split(";", 1)[0]?.trim().toLowerCase();
  return media && media.length > 0 ? media : undefined;
}

function upstream(action: string, status: number, headers: Record<string, string>): Rejected {
  const rate = parseSalesforceRateLimit(status, headers);
  if (rate.limited) {
    return rejected("CONNECTOR_RATE_LIMITED", "Salesforce rate limit exceeded.", rate.retryAfterSeconds);
  }
  return rejected("CONNECTOR_UPSTREAM_ERROR", `Salesforce rejected the ${action} request.`);
}

function transportError(error: unknown): Rejected {
  if (isRejected(error)) return error;
  if (error instanceof ConnectorHttpError) return rejected(error.code, error.message);
  return rejected("CONNECTOR_UNAVAILABLE", "Connector request failed.");
}

function rejected(code: string, message: string, retryAfterSeconds?: number): Rejected {
  return retryAfterSeconds === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, retryAfterSeconds };
}

function isRejected(value: unknown): value is Rejected {
  return isRecord(value) && value.ok === false && typeof value.code === "string" && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
