import { normalizeGmailMessage } from "../../connectors/google-workspace/src/messages";
import { createConnectorHttpClient } from "./http";

type RecordValue = Record<string, any>;
type Normalizer = (input: any) => any;
const hosts: Record<string, string> = {
  slack: "slack.com", telegram: "api.telegram.org",
  "google-workspace": "gmail.googleapis.com", "microsoft-365": "graph.microsoft.com",
};
const failure = (code: string, message: string) => ({ ok: false, code, message });
const invalidResponse = () => failure("CONNECTOR_RESPONSE_INVALID", "Message page does not match the provider contract.");
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw invalidResponse();
  return value;
}

// Fixture callers retain the existing normalization contract. Credentialed
// callers always fetch; an injected response can never suppress the live read.
export function withLiveMessageSync(connector: string, normalize: Normalizer): Normalizer {
  return (input: unknown) => {
    if (!record(input)) throw failure("INVALID_SYNC_INPUT", "Sync input must be an object.");
    const credential = connector === "telegram" ? input.botToken : input.accessToken;
    if (typeof credential !== "string" || !credential) return normalize(input);
    return fetchPage(connector, input, credential, normalize);
  };
}

async function fetchPage(connector: string, input: RecordValue, credential: string, normalize: Normalizer): Promise<unknown> {
  const limit = input.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw failure("INVALID_SYNC_INPUT", "Message page limit must be between 1 and 100.");
  const client = createConnectorHttpClient({
    allowedHosts: [hosts[connector]!], maxResponseBytes: 5 * 1024 * 1024,
    fetch: typeof input.fetch === "function" ? input.fetch : undefined,
  });
  let totalBytes = 0;
  const get = async (url: URL): Promise<RecordValue> => {
    const response = await client.fetchText(url, {
      method: "GET", headers: connector === "telegram" ? {} : { Authorization: `Bearer ${credential}` },
    });
    totalBytes += Buffer.byteLength(response.body);
    if (totalBytes > 5 * 1024 * 1024) throw failure("OUTPUT_TOO_LARGE", "Message page exceeds the response byte limit.");
    let body: unknown;
    try { body = JSON.parse(response.body); } catch { throw invalidResponse(); }
    if (!record(body)) throw invalidResponse();
    if (response.status === 429 || body.error_code === 429 || body.error === "ratelimited") {
      const hint = Number(body.parameters?.retry_after ?? response.headers["retry-after"] ?? 10);
      throw { ...failure("CONNECTOR_RATE_LIMITED", "Message provider rate limit exceeded."), retryAfterSeconds: Number.isFinite(hint) && hint > 0 ? Math.min(86400, Math.ceil(hint)) : 10 };
    }
    if (response.status < 200 || response.status >= 300 || body.ok === false || body.error) throw failure("CONNECTOR_UPSTREAM_ERROR", "Message provider rejected the page request.");
    return body;
  };
  let response: RecordValue;
  if (connector === "slack") {
    if (typeof input.channelId !== "string" || !input.channelId) throw failure("INVALID_SYNC_INPUT", "channelId is required.");
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", input.channelId);
    url.searchParams.set("limit", String(limit));
    if (input.cursor) url.searchParams.set("cursor", String(input.cursor));
    response = await get(url);
    if (response.ok !== true || !Array.isArray(response.messages)) throw invalidResponse();
  } else if (connector === "telegram") {
    const url = new URL(`https://api.telegram.org/bot${encodeURIComponent(credential).replace(/%3A/gi, ":")}/getUpdates`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("timeout", "0");
    url.searchParams.set("allowed_updates", JSON.stringify(["message", "edited_message", "channel_post", "edited_channel_post"]));
    if (input.cursor) {
      if (!/^\d+$/.test(String(input.cursor))) throw failure("INVALID_SYNC_INPUT", "Telegram cursor must be an update offset.");
      url.searchParams.set("offset", String(input.cursor));
    }
    const body = await get(url);
    if (body.ok !== true || !Array.isArray(body.result)) throw invalidResponse();
    for (const update of body.result) if (!record(update) || !Number.isSafeInteger(update.update_id)) throw invalidResponse();
    response = { ...body, result: body.result.filter((u: RecordValue) => u.message || u.edited_message || u.channel_post || u.edited_channel_post).map((u: RecordValue) => (() => { const message = u.message ?? u.edited_message ?? u.channel_post ?? u.edited_channel_post; return { ...u, message: { ...message, from: message.from ?? message.sender_chat } }; })()) };
    const output = normalize({ ...input, response });
    return { ...output, cursor: body.result.length ? String(Math.max(...body.result.map((u: RecordValue) => u.update_id)) + 1) : null };
  } else if (connector === "google-workspace") {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", String(limit));
    if (input.cursor) url.searchParams.set("pageToken", String(input.cursor));
    if (input.query) url.searchParams.set("q", String(input.query));
    response = await get(url);
    // Gmail omits messages for an empty mailbox; resultSizeEstimate proves that
    // shape is an empty page rather than an arbitrary successful JSON object.
    if (response.messages === undefined && response.resultSizeEstimate === 0) response = { ...response, messages: [] };
    if (!Array.isArray(response.messages) || response.messages.length > limit) throw invalidResponse();
    const messages = [];
    for (const item of response.messages) {
      const id = text(item?.id);
      const message = await get(new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`));
      text(message.id); text(message.threadId);
      messages.push(message);
    }
    response = { ...response, messages };
  } else {
    const url = new URL(input.cursor || "https://graph.microsoft.com/v1.0/me/messages");
    if (url.origin !== "https://graph.microsoft.com" || url.pathname !== "/v1.0/me/messages" || url.username || url.password) throw failure("INVALID_SYNC_INPUT", "Microsoft message cursor is invalid.");
    if (!input.cursor) {
      url.searchParams.set("$top", String(limit));
      if (input.filter) url.searchParams.set("$filter", String(input.filter));
    }
    response = await get(url);
    if (!Array.isArray(response.value)) throw invalidResponse();
    for (const item of response.value) text(item?.id);
  }
  for (const key of ["nextPageToken", "@odata.nextLink"]) {
    if (response[key] !== undefined && response[key] !== null && typeof response[key] !== "string") throw invalidResponse();
  }
  if (connector === "slack" && response.has_more === true && !response.response_metadata?.next_cursor) throw invalidResponse();
  let normalized: any;
  try { normalized = normalize({ ...input, response }); } catch { throw invalidResponse(); }
  const output = connector === "google-workspace" ? { ...normalized, items: response.messages.map(normalizeGmailMessage) } : normalized;
  if (!record(output) || !Array.isArray(output.items)) throw invalidResponse();
  if (connector === "google-workspace" || connector === "microsoft-365") {
    // Existing email models carry the conversation as threadId. The durable
    // Message store uses channelId for that same grouping, without changing
    // the fixture normalizers or replacing provider identity fields.
    return { ...output, cursor: connector === "microsoft-365" ? output.nextLink : output.cursor, items: output.items.map((item: RecordValue) => ({ ...item, channelId: text(item.threadId) })) };
  }
  return output;
}
