import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { createKlaviyoClient, isRecord, parseKlaviyoRateLimit } from "./http";

const CLIENT_REVISION = "2026-07-15";

type Failure = { ok: false; code: string; message: string; retryAfterSeconds?: number };

function asRecord(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("input must be an object");
  return input;
}

function requiredString(input: Record<string, unknown>, keys: string[], label: string): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error(`${label} is required`);
}

function companyId(input: Record<string, unknown>): string {
  return requiredString(input, ["companyId", "company_id"], "companyId");
}

function resourceId(input: Record<string, unknown>): string {
  return requiredString(input, ["id", "tagId", "tag_id"], "id");
}

function relatedResource(input: Record<string, unknown>, allowed: string[]): string {
  const value = requiredString(input, ["relatedResource", "related_resource"], "relatedResource");
  if (!allowed.includes(value)) throw new Error(`relatedResource must be one of ${allowed.join(", ")}`);
  return value;
}

function dataObject(input: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(input.data)) throw new Error("data is required");
  return input.data;
}

function dataArray(input: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(input.data) || input.data.length === 0 || !input.data.every(isRecord)) {
    throw new Error("data must be a non-empty array");
  }
  return input.data as Record<string, unknown>[];
}

function live(input: Record<string, unknown>): boolean {
  return typeof input.apiKey === "string" || typeof input.fetch === "function";
}

function fetchImpl(input: Record<string, unknown>): typeof fetch {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : fetch;
}

function throwFailure(failure: Failure): never {
  throw {
    ok: false,
    code: failure.code,
    message: failure.message,
    ...(failure.retryAfterSeconds !== undefined ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
  };
}

function fromStatus(status: number, headers: Record<string, string>, message: string): Failure {
  const limit = parseKlaviyoRateLimit(status, headers);
  if (limit.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: limit.retryAfterSeconds };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function validated(action: string, value: Record<string, unknown>): Record<string, unknown> {
  return { connector: "klaviyo", action, source: "connector", validated: value };
}

function succeeded(action: string, data: unknown): Record<string, unknown> {
  return { connector: "klaviyo", action, source: "connector", data };
}

async function publicPost(action: string, path: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const company = companyId(input);
  const data = dataObject(input);
  if (!live(input)) return validated(action, { companyId: company, data });
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: 1048576,
    fetch: fetchImpl(input),
  });
  const url = `https://a.klaviyo.com${path}?company_id=${encodeURIComponent(company)}`;
  const response = await http.fetchText(url, {
    method: "POST",
    headers: {
      revision: CLIENT_REVISION,
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
    body: JSON.stringify({ data }),
  });
  if (response.status >= 200 && response.status < 300) {
    try { return succeeded(action, JSON.parse(response.body)); } catch { return succeeded(action, null); }
  }
  throwFailure(fromStatus(response.status, response.headers, "Klaviyo rejected the client request."));
}

async function privateJSON(
  action: string,
  operation: string,
  apiKey: string,
  fetchFn: typeof fetch | undefined,
  path: string,
  init: RequestInit,
  ok: number[],
): Promise<Record<string, unknown>> {
  const client = createKlaviyoClient({ apiKey, fetch: fetchFn, operation });
  const result = await client.fetchJSON(path, init);
  if (ok.includes(result.status)) {
    return succeeded(action, result.body ?? null);
  }
  throwFailure(fromStatus(result.status, result.headers, "Klaviyo rejected the request."));
}

export function createClientEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.events.create", "/client/events", asRecord(input));
}

export function bulkCreateClientEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.events.bulkCreate", "/client/event-bulk-create", asRecord(input));
}

export function createClientProfile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.profiles.create", "/client/profiles", asRecord(input));
}

export function createClientPushToken(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.pushTokens.create", "/client/push-tokens", asRecord(input));
}

export function unregisterClientPushToken(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.pushTokens.unregister", "/client/push-token-unregister", asRecord(input));
}

export function createClientSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.subscriptions.create", "/client/subscriptions", asRecord(input));
}

export function createClientBackInStock(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  return publicPost("client.backInStock.create", "/client/back-in-stock-subscriptions", asRecord(input));
}

export async function uploadImageFromFile(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  const fileBase64 = requiredString(record, ["fileBase64", "file_base64"], "fileBase64");
  const fileName = requiredString(record, ["fileName", "file_name"], "fileName");
  const name = typeof record.name === "string" ? record.name : undefined;
  const hidden = typeof record.hidden === "boolean" ? record.hidden : undefined;
  if (typeof record.apiKey !== "string") return validated("images.uploadFromFile", { fileName, ...(name ? { name } : {}), ...(hidden !== undefined ? { hidden } : {}) });
  const bytes = Buffer.from(fileBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), fileName);
  if (name) form.append("name", name);
  if (hidden !== undefined) form.append("hidden", hidden ? "true" : "false");
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: 1048576,
    fetch: fetchImpl(record),
  });
  const response = await http.fetchText("https://a.klaviyo.com/api/image-upload", {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${record.apiKey}`,
      revision: CLIENT_REVISION,
      accept: "application/vnd.api+json",
    },
    body: form,
  });
  if (response.status >= 200 && response.status < 300) {
    try { return succeeded("images.uploadFromFile", JSON.parse(response.body)); } catch { return succeeded("images.uploadFromFile", null); }
  }
  throwFailure(fromStatus(response.status, response.headers, "Klaviyo rejected the image upload."));
}

const TAG_RESOURCES = ["campaigns", "flows", "lists", "segments"];

async function tagRelationship(action: string, method: "POST" | "DELETE", input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  const id = resourceId(record);
  const related = relatedResource(record, TAG_RESOURCES);
  const data = dataArray(record);
  if (typeof record.apiKey !== "string") return validated(action, { id, relatedResource: related, data });
  return privateJSON(action, action, record.apiKey, fetchImpl(record), `/tags/${encodeURIComponent(id)}/relationships/${related}`, {
    method,
    body: JSON.stringify({ data }),
  }, [200, 201, 202, 204]);
}

export function createTagRelationships(input: unknown): Promise<Record<string, unknown>> {
  return tagRelationship("tags.relationships.create", "POST", input);
}

export function deleteTagRelationships(input: unknown): Promise<Record<string, unknown>> {
  return tagRelationship("tags.relationships.delete", "DELETE", input);
}

async function getRelationship(action: string, input: unknown, allowed: string[], pathFor: (id: string, related: string) => string): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  const id = resourceId(record);
  const related = relatedResource(record, allowed);
  if (typeof record.apiKey !== "string") return validated(action, { id, relatedResource: related });
  const params = new URLSearchParams();
  for (const key of ["page[size]", "page[cursor]"]) {
    const value = record[key];
    if (typeof value === "string" && value.length) params.set(key, value);
    else if (typeof value === "number") params.set(key, String(value));
  }
  const query = params.toString();
  const path = pathFor(id, related) + (query ? `?${query}` : "");
  return privateJSON(action, action, record.apiKey, fetchImpl(record), path, { method: "GET" }, [200]);
}

export function getEventRelationships(input: unknown): Promise<Record<string, unknown>> {
  return getRelationship("events.relationships.get", input, ["metric", "profile"], (id, related) => `/events/${encodeURIComponent(id)}/relationships/${related}`);
}

export function getSegmentRelationships(input: unknown): Promise<Record<string, unknown>> {
  return getRelationship("segments.relationships.get", input, ["profiles", "tags"], (id, related) => `/segments/${encodeURIComponent(id)}/relationships/${related}`);
}

export function getTagRelationships(input: unknown): Promise<Record<string, unknown>> {
  return getRelationship("tags.relationships.get", input, ["campaigns", "flows", "lists", "segments", "tag-group"], (id, related) => `/tags/${encodeURIComponent(id)}/relationships/${related}`);
}

export function getProfileRelationships(input: unknown): Promise<Record<string, unknown>> {
  return getRelationship("profiles.relationships.get", input, ["lists", "segments"], (id, related) => `/profiles/${encodeURIComponent(id)}/relationships/${related}`);
}

export async function unsubscribeProfilesBulk(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  const emails = Array.isArray(record.emails) ? record.emails.filter((email): email is string => typeof email === "string" && email.length > 0) : [];
  const listId = requiredString(record, ["listId", "list_id"], "listId");
  if (!emails.length) throw new Error("emails must be a non-empty array");
  if (typeof record.apiKey !== "string") return validated("profiles.unsubscribeBulk", { emails, listId });
  const data = {
    type: "profile-subscription-bulk-delete-job",
    attributes: {
      profiles: {
        data: emails.map((email) => ({
          type: "profile",
          attributes: { email, subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED" } } } },
        })),
      },
    },
    relationships: { list: { data: { type: "list", id: listId } } },
  };
  return privateJSON("profiles.unsubscribeBulk", "profiles.unsubscribeBulk", record.apiKey, fetchImpl(record), "/profile-subscription-bulk-delete-jobs", {
    method: "POST",
    body: JSON.stringify({ data }),
  }, [200, 201, 202]);
}

export async function unsuppressProfilesBulk(input: unknown): Promise<Record<string, unknown>> {
  const record = asRecord(input);
  const suppressions = Array.isArray(record.suppressions)
    ? record.suppressions.flatMap((entry) => {
        if (typeof entry === "string" && entry.length) return [entry];
        if (isRecord(entry) && typeof entry.email === "string" && entry.email.length) return [entry.email];
        return [];
      })
    : [];
  if (!suppressions.length) throw new Error("suppressions must be a non-empty array");
  if (typeof record.apiKey !== "string") return validated("profiles.unsuppressBulk", { suppressions });
  const data = {
    type: "profile-suppression-bulk-delete-job",
    attributes: { profiles: { data: suppressions.map((email) => ({ type: "profile", attributes: { email } })) } },
  };
  return privateJSON("profiles.unsuppressBulk", "profiles.unsuppressBulk", record.apiKey, fetchImpl(record), "/profile-suppression-bulk-delete-jobs", {
    method: "POST",
    body: JSON.stringify({ data }),
  }, [200, 201, 202]);
}
