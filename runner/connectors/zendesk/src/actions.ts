import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { ConnectorHttpError, createConnectorHttpClient, hostIsAllowed } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { assertVendorLabel, assertSafePathSegment } from "../../_shared/jobboard";

const compiled = compileDeclarativeConnector(manifest as never);
const allowedHosts = ["*.zendesk.com"];
const operations = manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>;

type ZendeskInput = Record<string, unknown> & {
  fetch?: typeof fetch;
  apiToken?: string;
  email?: string;
  subdomain?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(message = "Action input is invalid."): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function envelope(action: string, data: unknown): Record<string, unknown> {
  return { connector: "zendesk", action, source: "provider", data };
}

function credentials(input: unknown): { email: string; apiToken: string; subdomain: string } {
  if (!isRecord(input)) invalidInput();
  const email = input.email;
  const apiToken = input.apiToken;
  if (typeof email !== "string" || email.length === 0 || email.length > 254 || /[\r\n]/.test(email)) invalidInput("email is required");
  if (typeof apiToken !== "string" || apiToken.length === 0 || apiToken.length > 256 || /[\r\n]/.test(apiToken)) invalidInput("apiToken is required");
  const subdomain = assertVendorLabel(input.subdomain, "subdomain", "zendesk.com");
  return { email, apiToken, subdomain };
}

function authorizationHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}/token:${apiToken}`, "utf8").toString("base64")}`;
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) {
    invalidInput(`${name} is required`);
  }
  return assertSafePathSegment(String(value), name);
}

function requireToken(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) invalidInput(`${name} is required`);
  // Path ids also pass the shared guard (SEC-PATH-2); the local regex is narrower.
  return assertSafePathSegment(value, name);
}

function requireFilename(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 255) invalidInput("filename is required");
  if (/[\u0000\r\n/\\]/.test(value) || value === "." || value === "..") invalidInput("filename is required");
  return value;
}

function tagList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") invalidInput("tags is required");
  const tags = value.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  if (tags.length === 0 || tags.length > 100) invalidInput("tags is required");
  for (const tag of tags) {
    if (tag.length > 255 || /[\u0000\r\n]/.test(tag)) invalidInput("tags is required");
  }
  return tags;
}

function clientFor(input: ZendeskInput, action: string) {
  const operation = operations[action];
  return createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes: operation?.maxResponseBytes ?? 5_242_880,
    timeoutMs: operation?.timeoutMs ?? 15_000,
    fetch: typeof input.fetch === "function" ? input.fetch : undefined,
  });
}

function failStatus(status: number, body: string, headers: Record<string, string>): never {
  if (status === 429) {
    const retry = Number(headers["retry-after"] ?? headers["Retry-After"]);
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Zendesk rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 60,
    };
  }
  let message = `Zendesk request failed (HTTP ${status}).`;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const error = parsed.error ?? parsed.description ?? parsed.message;
    if (typeof error === "string" && error.trim()) message = error.slice(0, 300);
  } catch {
    if (body.trim()) message = body.slice(0, 300);
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

async function sendJson(
  action: string,
  input: ZendeskInput,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const creds = credentials(input);
  const client = clientFor(input, action);
  let response;
  try {
    response = await client.fetchText(`https://${creds.subdomain}.zendesk.com/api/v2${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: authorizationHeader(creds.email, creds.apiToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status < 200 || response.status >= 300) failStatus(response.status, response.body, response.headers);
  try {
    return response.body.trim() ? JSON.parse(response.body) : {};
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

async function deleteResourceTags(action: string, input: unknown, idName: string, path: (id: string) => string): Promise<unknown> {
  const tags = isRecord(input) ? tagList(input.tags) : undefined;
  if (!tags) return withSubdomainGuard(compiled.actions[action]!)(input);
  const id = requireId(isRecord(input) ? input[idName] : undefined, idName);
  const data = await sendJson(action, input as ZendeskInput, "DELETE", path(id), { tags });
  return envelope(action, data);
}

export function deleteTicketTags(input: unknown): Promise<unknown> {
  return deleteResourceTags("tickets.tags.delete", input, "ticket_id", (id) => `/tickets/${id}/tags`);
}

export function deleteUserTags(input: unknown): Promise<unknown> {
  return deleteResourceTags("users.tags.delete", input, "user_id", (id) => `/users/${id}/tags`);
}

export function deleteOrganizationTags(input: unknown): Promise<unknown> {
  return deleteResourceTags("organizations.tags.delete", input, "organization_id", (id) => `/organizations/${id}/tags`);
}

function fileBytes(content: unknown, limit: number): Uint8Array {
  if (typeof content !== "string" || content.length === 0) invalidInput("content is required");
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > limit) invalidInput("content exceeds the upload size limit");
  return bytes;
}

export async function createCustomObjectRecordAttachment(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) invalidInput();
  const key = requireToken(input.custom_object_key, "custom_object_key");
  const recordId = requireToken(input.record_id, "record_id");
  const filename = requireFilename(input.filename);
  const bytes = fileBytes(input.content, 10 * 1024 * 1024);
  const creds = credentials(input);
  const form = new FormData();
  form.append("uploaded_data", new Blob([bytes], { type: "application/octet-stream" }), filename);
  const client = clientFor(input as ZendeskInput, "custom_objects.records.attachments.create");
  let response;
  try {
    response = await client.fetchText(
      `https://${creds.subdomain}.zendesk.com/api/v2/custom_objects/${key}/records/${recordId}/attachments`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorizationHeader(creds.email, creds.apiToken),
        },
        body: form,
      },
    );
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status < 200 || response.status >= 300) failStatus(response.status, response.body, response.headers);
  try {
    return envelope("custom_objects.records.attachments.create", response.body.trim() ? JSON.parse(response.body) : {});
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function contentUrlOf(parsed: unknown): string | undefined {
  if (!isRecord(parsed)) return undefined;
  if (typeof parsed.content_url === "string") return parsed.content_url;
  if (isRecord(parsed.attachment) && typeof parsed.attachment.content_url === "string") return parsed.attachment.content_url;
  return undefined;
}

function decodeBody(bytes: Uint8Array, contentType: string): unknown {
  const type = contentType.toLowerCase();
  if (type.includes("application/json") || type.startsWith("text/") || type.includes("application/pem") || type === "") {
    const text = new TextDecoder().decode(bytes);
    if (type.includes("application/json") || type === "") {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }
  return { content_base64: Buffer.from(bytes).toString("base64"), content_type: contentType || "application/octet-stream" };
}

async function fetchAllowed(
  input: ZendeskInput,
  url: string,
  creds: { email: string; apiToken: string; subdomain: string },
  maxBytes: number,
  sendAuth: boolean,
): Promise<{ status: number; headers: Headers; bytes: Uint8Array; location: string | null }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) invalidInput("content url is invalid");
  if (!hostIsAllowed(parsed.hostname, allowedHosts)) {
    throw { ok: false, code: "OUTBOUND_HOST_NOT_ALLOWED", message: "Attachment content host is not allowed." };
  }
  const fetchImpl = typeof input.fetch === "function" ? input.fetch : fetch;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (sendAuth && parsed.hostname === `${creds.subdomain}.zendesk.com`) {
    headers.Authorization = authorizationHeader(creds.email, creds.apiToken);
  }
  let response: Response;
  try {
    response = await fetchImpl(parsed.toString(), { method: "GET", headers, redirect: "manual" });
  } catch {
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status >= 300 && response.status < 400) {
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(), location: response.headers.get("location") };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw { ok: false, code: "OUTBOUND_RESPONSE_TOO_LARGE", message: "Outbound response exceeded the configured byte limit." };
  }
  return { status: response.status, headers: response.headers, bytes, location: null };
}

async function followDownload(
  action: string,
  input: ZendeskInput,
  startUrl: string,
): Promise<unknown> {
  const creds = credentials(input);
  const maxBytes = operations[action]?.maxResponseBytes ?? 5_242_880;
  let current = startUrl;
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetchAllowed(input, current, creds, maxBytes, true);
    if (response.status >= 300 && response.status < 400) {
      if (!response.location) throw { ok: false, code: "OUTBOUND_REDIRECT_BLOCKED", message: "Outbound redirects are blocked by the connector HTTP boundary." };
      const next = new URL(response.location, current);
      if (!hostIsAllowed(next.hostname, allowedHosts)) {
        throw { ok: false, code: "OUTBOUND_HOST_NOT_ALLOWED", message: "Attachment content host is not allowed." };
      }
      current = next.toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      failStatus(response.status, new TextDecoder().decode(response.bytes), Object.fromEntries(response.headers.entries()));
    }
    return decodeBody(response.bytes, response.headers.get("content-type") ?? "");
  }
  throw { ok: false, code: "OUTBOUND_REDIRECT_BLOCKED", message: "Outbound redirects are blocked by the connector HTTP boundary." };
}

export async function downloadAttachment(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) invalidInput();
  const attachmentId = requireToken(input.attachment_id, "attachment_id");
  const creds = credentials(input);
  const meta = await followDownload(
    "attachments.download",
    input as ZendeskInput,
    `https://${creds.subdomain}.zendesk.com/api/v2/attachments/${attachmentId}`,
  );
  const contentUrl = contentUrlOf(meta);
  if (!contentUrl) return envelope("attachments.download", meta);
  let parsed: URL;
  try {
    parsed = new URL(contentUrl, `https://${creds.subdomain}.zendesk.com`);
  } catch {
    invalidInput("content url is invalid");
  }
  if (!hostIsAllowed(parsed.hostname, allowedHosts)) {
    throw { ok: false, code: "OUTBOUND_HOST_NOT_ALLOWED", message: "Attachment content host is not allowed." };
  }
  const file = await followDownload("attachments.download", input as ZendeskInput, parsed.toString());
  return envelope("attachments.download", file);
}

export async function downloadCustomObjectRecordAttachment(input: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(input)) invalidInput();
  const key = requireToken(input.custom_object_key, "custom_object_key");
  const recordId = requireToken(input.record_id, "record_id");
  const id = requireToken(input.id, "id");
  const creds = credentials(input);
  const url = new URL(
    `https://${creds.subdomain}.zendesk.com/api/v2/custom_objects/${key}/records/${recordId}/attachments/${id}/download`,
  );
  if (typeof input.inline === "boolean") url.searchParams.set("inline", input.inline ? "true" : "false");
  const file = await followDownload("custom_objects.records.attachments.download", input as ZendeskInput, url.toString());
  return envelope("custom_objects.records.attachments.download", file);
}

// SEC-PATH-2c-2: the declarative operations render `https://{{subdomain}}.zendesk.com`
// straight from the stored credential, so `.`/`..`/`%2e` produced `https://..zendesk.com`
// and `acme.evil` added a label. Every compiled operation is re-registered behind the
// same host-label check the hand-written ones use; the fixture path (no credential,
// no subdomain) is left to the compiled handler's echo.
function withSubdomainGuard(handler: (input: unknown) => unknown): (input: unknown) => unknown {
  return (input: unknown) => {
    if (!isRecord(input) || (input.subdomain === undefined && input.apiToken === undefined)) return handler(input);
    let subdomain: string;
    try {
      subdomain = assertVendorLabel(input.subdomain, "subdomain", "zendesk.com");
    } catch (error) {
      return Promise.reject(error);
    }
    return handler({ ...input, subdomain });
  };
}

const guardedDeclarativeActions = Object.fromEntries(
  Object.entries(compiled.actions).map(([key, handler]) => [key, withSubdomainGuard(handler)]),
);

export const zendeskActions: Record<string, (input: unknown) => unknown> = {
  ...guardedDeclarativeActions,
  "tickets.tags.delete": deleteTicketTags,
  "users.tags.delete": deleteUserTags,
  "organizations.tags.delete": deleteOrganizationTags,
  "custom_objects.records.attachments.create": createCustomObjectRecordAttachment,
  "attachments.download": downloadAttachment,
  "custom_objects.records.attachments.download": downloadCustomObjectRecordAttachment,
};
