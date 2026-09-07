import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { normalizeUser, parseNextCursor, type NormalizedUser, type NotionUser } from "./users";

const notionVersion = "2026-03-11";

export type UsersListSyncInput = {
  response: unknown;
};

export type UsersListSyncResult = {
  provider: "notion";
  operation: "users.list";
  items: NormalizedUser[];
  cursor: string | null;
};

export type UsersListClientInput = {
  cursor?: string;
  pageSize?: number;
};

export type ConnectorErrorCode =
  | "AUTHENTICATION_FAILED"
  | "CONNECTOR_CAPABILITY_MISSING"
  | "CONNECTOR_RATE_LIMITED"
  | "CONNECTOR_UPSTREAM_ERROR";

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  providerError?: string;
  retryAfterSeconds?: number;
};

export type UsersListClientResult =
  | { ok: true; items: NormalizedUser[]; cursor: string | null }
  | { ok: false; error: ConnectorError };

export type NotionUsersClient = {
  list(input: UsersListClientInput): Promise<UsersListClientResult>;
};

export type NotionUsersClientOptions = {
  notionToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export function executeUsersListSync(input: UsersListSyncInput): UsersListSyncResult {
  const response = requireRecord(input.response, "response");
  const users = requireArray(response.results, "results") as NotionUser[];

  return {
    provider: "notion",
    operation: "users.list",
    items: users.map((user) => normalizeUser(user)),
    cursor: parseNextCursor(response),
  };
}

export function createNotionUsersClient(options: NotionUsersClientOptions): NotionUsersClient {
  const notionToken = requireNonEmptyString(options.notionToken, "notionToken");
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["users.list"].maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async list(input: UsersListClientInput): Promise<UsersListClientResult> {
      const response = await httpClient.fetchText(buildUsersURL(input), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": notionVersion,
        },
      });
      const body = readJsonObject(response.body);
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, error: mapNotionUsersError(response.status, response.headers, body) };
      }

      const syncResult = executeUsersListSync({ response: body });
      return {
        ok: true,
        items: syncResult.items,
        cursor: syncResult.cursor,
      };
    },
  };
}

function buildUsersURL(input: UsersListClientInput): string {
  const url = new URL("https://api.notion.com/v1/users");
  if (typeof input.cursor === "string" && input.cursor.trim().length > 0) {
    url.searchParams.set("start_cursor", input.cursor.trim());
  }
  if (typeof input.pageSize === "number") {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error("pageSize must be an integer between 1 and 100");
    }
    url.searchParams.set("page_size", String(input.pageSize));
  }
  return url.toString();
}

function mapNotionUsersError(
  status: number,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): ConnectorError {
  const providerError = typeof body.code === "string" ? body.code : undefined;
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    return {
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      providerError,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0,
    };
  }
  if (status === 401) {
    return {
      code: "AUTHENTICATION_FAILED",
      message: "Notion rejected the provided credentials.",
      providerError,
    };
  }
  if (status === 403) {
    return {
      code: "CONNECTOR_CAPABILITY_MISSING",
      message: "Notion credentials do not have access to list users.",
      providerError,
    };
  }
  return {
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: "Notion rejected the users.list request.",
    providerError,
  };
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const decoded = JSON.parse(bodyText);
    return requireRecord(decoded, "response");
  } catch {
    return {};
  }
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}
