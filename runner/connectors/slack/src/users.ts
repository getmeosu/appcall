import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { parseRateLimitMetadata, type ConnectorError } from "./messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlackUser = {
  id: string;
  name?: string;
  real_name?: string;
  is_bot?: boolean;
  deleted?: boolean;
  profile?: {
    email?: string;
    display_name?: string;
    real_name?: string;
    image_72?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type NormalizedUser = {
  id: string;
  provider: "slack";
  name: string;
  realName: string;
  displayName: string;
  email: string;
  isBot: boolean;
  deleted: boolean;
  modelVersion: "2026-05-14";
  raw: SlackUser;
};

export type UsersListInput = {
  cursor?: string;
  limit?: number;
};

export type UsersListResult =
  | { ok: true; members: NormalizedUser[]; nextCursor: string | null }
  | { ok: false; error: ConnectorError };

export type SlackUsersClientOptions = {
  token: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeUser(user: SlackUser): NormalizedUser {
  const profile = isRecord(user.profile) ? user.profile : {};
  return {
    id: requireString(user.id, "user.id"),
    provider: "slack",
    name: typeof user.name === "string" ? user.name : "",
    realName: typeof user.real_name === "string" ? user.real_name : (typeof profile.real_name === "string" ? profile.real_name : ""),
    displayName: typeof profile.display_name === "string" ? profile.display_name : "",
    email: typeof profile.email === "string" ? profile.email : "",
    isBot: typeof user.is_bot === "boolean" ? user.is_bot : false,
    deleted: typeof user.deleted === "boolean" ? user.deleted : false,
    modelVersion: "2026-05-14",
    raw: user,
  };
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateUsersListInput(input: unknown): UsersListInput {
  if (!isRecord(input)) throw new Error("users.list input must be an object");
  return {
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 1000) : undefined,
  };
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createSlackUsersClient(options: SlackUsersClientOptions) {
  const token = requireString(options.token, "token");
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.send"].maxResponseBytes,
    fetch: options.fetch,
  });

  async function slackGet(endpoint: string, params: Record<string, string | number | undefined>): Promise<{ status: number; data: Record<string, unknown> }> {
    const url = new URL(`https://slack.com/api/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await httpClient.fetchText(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return { status: response.status, data: safeJsonObject(response.body) };
  }

  function rateLimitError(status: number): ConnectorError | null {
    const rateLimit = parseRateLimitMetadata(status, {});
    if (rateLimit.limited) {
      return { code: "CONNECTOR_RATE_LIMITED", message: "The upstream provider rate limited this request.", retryAfterSeconds: rateLimit.retryAfterSeconds };
    }
    return null;
  }

  function extractNextCursor(data: Record<string, unknown>): string | null {
    const metadata = data.response_metadata;
    if (!isRecord(metadata)) return null;
    const cursor = metadata.next_cursor;
    return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
  }

  return {
    async list(input: unknown): Promise<UsersListResult> {
      const payload = validateUsersListInput(input);
      const { status, data } = await slackGet("users.list", {
        cursor: payload.cursor,
        limit: payload.limit,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) {
        return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the users.list request.", providerError: typeof data.error === "string" ? data.error : undefined } };
      }
      const members = Array.isArray(data.members) ? data.members.filter(isRecord).map((u) => normalizeUser(u as SlackUser)) : [];
      return { ok: true, members, nextCursor: extractNextCursor(data) };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(bodyText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
