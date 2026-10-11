import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(message = "Action input is invalid."): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asFetch(value: unknown): typeof fetch | undefined {
  return typeof value === "function" ? (value as typeof fetch) : undefined;
}

function pickId(input: JsonRecord, camel: string, snake: string): string {
  return asString(input[camel]) ?? asString(input[snake]) ?? invalidInput(`${camel} is required`);
}

function mergeMaps(input: JsonRecord, keys: string[]): JsonRecord {
  const merged: JsonRecord = {};
  for (const key of keys) {
    const value = input[key];
    if (isRecord(value)) Object.assign(merged, value);
  }
  return merged;
}

function operationMeta(key: string): { maxResponseBytes?: number; timeoutMs?: number } {
  return (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[key] ?? {};
}

async function botStarRequest(input: {
  apiKey: string;
  fetch?: typeof fetch;
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: JsonRecord;
  action: string;
  success: number[];
}): Promise<JsonRecord> {
  const operation = operationMeta(input.action);
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: operation.maxResponseBytes ?? 1048576,
    timeoutMs: operation.timeoutMs ?? 15000,
    fetch: input.fetch,
  });
  const url = new URL(input.path.replace(/^\//, ""), "https://apis.botstar.com/v1/");
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
  };
  let body: string | undefined;
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input.body);
  }
  const response = await client.fetchText(url, { method: input.method, headers, body });
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "BotStar rate limit exceeded.",
      retryAfterSeconds: 30,
    };
  }
  if (!input.success.includes(response.status)) {
    let detail: string | undefined;
    try {
      const parsed = JSON.parse(response.body) as { message?: unknown; error?: unknown };
      if (typeof parsed.message === "string") detail = parsed.message;
      else if (typeof parsed.error === "string") detail = parsed.error;
    } catch {
      detail = undefined;
    }
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: detail ?? `BotStar rejected the ${input.action} request.`,
    };
  }
  let data: unknown = null;
  if (response.body.trim() !== "") {
    try {
      data = JSON.parse(response.body);
    } catch {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
    }
  }
  return { connector: "bot-star", action: input.action, source: "provider", data };
}

function requireApiKey(input: unknown): JsonRecord & { apiKey: string } {
  if (!isRecord(input) || typeof input.apiKey !== "string" || input.apiKey.length === 0) {
    return { ...(isRecord(input) ? input : {}), apiKey: "" };
  }
  return input as JsonRecord & { apiKey: string };
}

export function createBotAttribute(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  const input = requireApiKey(inputValue);
  if (!input.apiKey) return { connector: "bot-star", action: "bot-attributes.create", source: "connector", validated: inputValue };
  const botId = pickId(input, "botId", "bot_id");
  const name = asString(input.name) ?? invalidInput("name is required");
  const dataType = asString(input.data_type) ?? asString(input.type) ?? invalidInput("data_type is required");
  const body: JsonRecord = {
    ...mergeMaps(input, ["additional_values", "localizedValues"]),
    name,
    data_type: dataType,
  };
  if (input.desc !== undefined) body.desc = input.desc;
  if (input.value !== undefined) body.value = input.value;
  return botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "POST",
    path: `/bots/${encodeURIComponent(botId)}/attributes`,
    query: { env: asString(input.env) },
    body,
    action: "bot-attributes.create",
    success: [200, 201],
  });
}

export function updateBotAttribute(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  const input = requireApiKey(inputValue);
  if (!input.apiKey) return { connector: "bot-star", action: "bot-attributes.update", source: "connector", validated: inputValue };
  const botId = pickId(input, "botId", "bot_id");
  const attributeId = pickId(input, "attributeId", "attribute_id");
  const extras = mergeMaps(input, ["additional_values", "localizedValues"]);
  const body: JsonRecord = { ...extras };
  if (input.desc !== undefined) body.desc = input.desc;
  if (input.value !== undefined) body.value = input.value;
  return botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "PATCH",
    path: `/bots/${encodeURIComponent(botId)}/attributes/${encodeURIComponent(attributeId)}`,
    query: { env: asString(input.env) },
    body,
    action: "bot-attributes.update",
    success: [200],
  });
}

export function createCmsEntityItem(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  const input = requireApiKey(inputValue);
  if (!input.apiKey) return { connector: "bot-star", action: "cms-entity-items.create", source: "connector", validated: inputValue };
  const botId = pickId(input, "botId", "bot_id");
  const entityId = pickId(input, "entityId", "entity_id");
  const name = asString(input.name) ?? invalidInput("name is required");
  const extras = mergeMaps(input, ["additional_fields", "custom_fields", "data"]);
  if ("name" in extras || "status" in extras) {
    invalidInput("data.name conflicts with an explicit CMS item field.");
  }
  const body: JsonRecord = { ...extras, name };
  if (input.status !== undefined) body.status = input.status;
  return botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "POST",
    path: `/bots/${encodeURIComponent(botId)}/cms_entities/${encodeURIComponent(entityId)}/items`,
    query: { env: asString(input.env) },
    body,
    action: "cms-entity-items.create",
    success: [200, 201],
  });
}

export function updateCmsEntityItem(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  const input = requireApiKey(inputValue);
  if (!input.apiKey) return { connector: "bot-star", action: "cms-entity-items.update", source: "connector", validated: inputValue };
  const botId = pickId(input, "botId", "bot_id");
  const entityId = pickId(input, "entityId", "entity_id");
  const entityItemId = pickId(input, "entityItemId", "entity_item_id");
  const extras = mergeMaps(input, ["custom_fields", "additional_fields", "data"]);
  if ("name" in extras || "status" in extras) {
    invalidInput("data.name conflicts with an explicit CMS item field.");
  }
  const body: JsonRecord = { ...extras };
  if (input.name !== undefined) body.name = input.name;
  if (input.status !== undefined) body.status = input.status;
  return botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "PATCH",
    path: `/bots/${encodeURIComponent(botId)}/cms_entities/${encodeURIComponent(entityId)}/items/${encodeURIComponent(entityItemId)}`,
    query: { env: asString(input.env) },
    body,
    action: "cms-entity-items.update",
    success: [200],
  });
}

function pickBotId(input: JsonRecord): string {
  return asString(input.botId) ?? asString(input.bot_id) ?? asString(input.appId) ?? invalidInput("botId is required");
}

function audienceUserBody(source: JsonRecord, extraMaps: string[] = []): JsonRecord {
  const body: JsonRecord = { ...mergeMaps(source, extraMaps) };
  for (const key of ["first_name", "last_name", "email", "gender", "birthday", "locale", "timezone", "tags"]) {
    if (source[key] !== undefined) body[key] = source[key];
  }
  const picture = source.picture ?? source.avatar;
  if (picture !== undefined) body.picture = picture;
  delete body.user_id;
  delete body.userId;
  delete body.avatar;
  return body;
}

export function updateUser(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  const input = requireApiKey(inputValue);
  if (!input.apiKey) return { connector: "bot-star", action: "users.update", source: "connector", validated: inputValue };
  const botId = pickBotId(input);
  const userId = pickId(input, "userId", "user_id");
  const body = audienceUserBody(input, ["additional_attributes", "attributes"]);
  if (Object.keys(body).length === 0) invalidInput("at least one user attribute is required");
  return botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "PATCH",
    path: `/bots/${encodeURIComponent(botId)}/users/${encodeURIComponent(userId)}`,
    body,
    action: "users.update",
    success: [200],
  });
}

export async function bootLivechat(inputValue: unknown): Promise<JsonRecord> {
  const input = requireApiKey(inputValue);
  if (!input.apiKey) return { connector: "bot-star", action: "livechat.boot", source: "connector", validated: inputValue };
  const appId =
    asString(input.appId) ?? asString(input.botId) ?? asString(input.bot_id) ?? invalidInput("appId is required");
  const bot = await botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "GET",
    path: `/bots/${encodeURIComponent(appId)}`,
    action: "livechat.boot",
    success: [200],
  });
  const user = isRecord(input.user) ? input.user : undefined;
  const userId = user ? asString(user.user_id) ?? asString(user.userId) : undefined;
  if (!userId) return bot;
  const body = audienceUserBody(user, []);
  if (isRecord(input.variables)) Object.assign(body, input.variables);
  if (Object.keys(body).length === 0) return bot;
  return botStarRequest({
    apiKey: input.apiKey,
    fetch: asFetch(input.fetch),
    method: "PATCH",
    path: `/bots/${encodeURIComponent(appId)}/users/${encodeURIComponent(userId)}`,
    body,
    action: "livechat.boot",
    success: [200],
  });
}
