/**
 * Greenhouse HTTP clients.
 *
 * Two surfaces:
 * - Public Job Board (`createClient`) — jobs.list against
 *   boards-api.greenhouse.io/v1/boards/{boardToken}
 * - Authenticated Harvest API (`createAuthClient`) — OAuth2 client credentials
 *   against https://auth.greenhouse.io/token, then Bearer JWT on
 *   https://harvest.greenhouse.io/v3 (GH-0; Basic apiKey is dead post-2026-08-31).
 *
 * Both route through the shared outbound stack for allowlist, redirect blocking,
 * response-size bounds, deadlines, and inject-fetch for tests.
 */
import { createConnectorHttpClient } from "../../../bun/src/http";
import {
  createJobBoardClient,
  assertSafePathSegment,
  upstreamErrorFor,
  type JobBoardClient,
  type ConnectorUpstreamError,
} from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface GreenhouseClientConfig {
  boardToken: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
}

export interface GreenhouseAuthClientConfig {
  clientId: string;
  clientSecret: string;
  /** Optional `sub` claim (Greenhouse user id) for Site Admin authorization. */
  userId?: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
  /** Manifest operation key used for timeout / response-size bounds. */
  operation?: string;
}

export type GreenhouseAuthClient = {
  /** GET `path` relative to the Harvest v3 base URL and parse JSON. */
  getJSON(path: string): Promise<unknown>;
  /**
   * GET with response headers (for Link rel=next cursor pagination).
   */
  getJSONWithMeta(path: string): Promise<{ body: unknown; headers: Record<string, string>; nextCursor: string | null }>;
  /**
   * POST `path` with a JSON body. Accepts 2xx including 204 No Content
   * (returns `undefined` when the body is empty).
   */
  postJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
  /**
   * PATCH `path` with a JSON body. Accepts 2xx including 204 No Content
   * (returns `undefined` when the body is empty).
   */
  patchJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
};

type OperationBounds = { maxResponseBytes: number; timeoutMs: number };

type CachedToken = { accessToken: string; expiresAtMs: number };

const AUTH_TOKEN_URL = "https://auth.greenhouse.io/token";
const HARVEST_BASE = "https://harvest.greenhouse.io/v3";
/** Refresh a little early so we do not race the expiry boundary. */
const EXPIRY_SKEW_MS = 60_000;

const tokenCache = new Map<string, CachedToken>();

function operationBounds(operation: string | undefined, fallback: string): OperationBounds {
  const ops = manifest.operations as Record<string, Partial<OperationBounds>>;
  const primary = operation ? ops[operation] : undefined;
  const secondary = ops[fallback];
  return {
    maxResponseBytes: primary?.maxResponseBytes ?? secondary?.maxResponseBytes ?? 5_242_880,
    timeoutMs: primary?.timeoutMs ?? secondary?.timeoutMs ?? 30_000,
  };
}

function cacheKey(clientId: string, userId: string | undefined): string {
  return `${clientId}\0${userId ?? ""}`;
}

/** Strip secrets from untrusted upstream bodies before they reach logs/errors. */
export function redactGreenhouseSecrets(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

export function parseNextCursorFromLink(headers: Record<string, string>): string | null {
  const link = headers["link"] ?? headers["Link"];
  if (typeof link !== "string" || link.length === 0) return null;
  // Example: <https://harvest.greenhouse.io/v3/candidates?cursor=abc&per_page=100>; rel="next"
  const parts = link.split(",");
  for (const part of parts) {
    if (!/rel\s*=\s*"?next"?/i.test(part)) continue;
    const m = part.match(/<([^>]+)>/);
    if (!m?.[1]) continue;
    try {
      const url = new URL(m[1]);
      const cursor = url.searchParams.get("cursor");
      if (cursor && cursor.length > 0) return cursor;
    } catch {
      // ignore malformed
    }
  }
  return null;
}

function clientCredentialsBasicHeader(clientId: string, clientSecret: string): string {
  const token = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

/** Test helper: clear the process-wide token cache. */
export function clearGreenhouseTokenCache(): void {
  tokenCache.clear();
}

export function createClient(config: GreenhouseClientConfig): JobBoardClient {
  const boardToken = assertSafePathSegment(config.boardToken, "boardToken");
  const jobsListOperation = manifest.operations["jobs.list"];
  return createJobBoardClient({
    provider: "Greenhouse",
    baseUrl: `https://boards-api.greenhouse.io/v1/boards/${boardToken}`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: jobsListOperation.maxResponseBytes,
    timeoutMs: jobsListOperation.timeoutMs,
    fetch: config.fetch,
  });
}

export function createAuthClient(config: GreenhouseAuthClientConfig): GreenhouseAuthClient {
  if (typeof config.clientId !== "string" || config.clientId.length === 0) {
    throw new Error("clientId is required");
  }
  if (typeof config.clientSecret !== "string" || config.clientSecret.length === 0) {
    throw new Error("clientSecret is required");
  }
  const userId =
    typeof config.userId === "string" && config.userId.length > 0 ? config.userId : undefined;
  const secrets = [config.clientSecret];
  const bounds = operationBounds(config.operation, "candidates.list");
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    fetch: config.fetch,
  });
  const key = cacheKey(config.clientId, userId);

  async function mintAccessToken(): Promise<string> {
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");
    if (userId) body.set("sub", userId);

    const response = await http.fetchText(AUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: clientCredentialsBasicHeader(config.clientId, config.clientSecret),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (response.status < 200 || response.status >= 300) {
      const safeBody = redactGreenhouseSecrets(response.body, secrets);
      throw upstreamErrorFor("Greenhouse", response.status, response.headers, safeBody);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Greenhouse token endpoint returned a non-JSON body.",
      } satisfies ConnectorUpstreamError;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Greenhouse token endpoint returned an unexpected payload.",
      } satisfies ConnectorUpstreamError;
    }
    const record = parsed as Record<string, unknown>;
    const accessToken = record.access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Greenhouse token endpoint omitted access_token.",
      } satisfies ConnectorUpstreamError;
    }
    secrets.push(accessToken);
    const expiresInRaw = record.expires_in;
    const expiresInSec =
      typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw)
        ? expiresInRaw
        : typeof expiresInRaw === "string" && Number.isFinite(Number(expiresInRaw))
          ? Number(expiresInRaw)
          : 3600;
    const expiresAtMs = Date.now() + Math.max(0, expiresInSec * 1000 - EXPIRY_SKEW_MS);
    tokenCache.set(key, { accessToken, expiresAtMs });
    return accessToken;
  }

  async function getAccessToken(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh) {
      const cached = tokenCache.get(key);
      if (cached && cached.expiresAtMs > Date.now() && cached.accessToken.length > 0) {
        return cached.accessToken;
      }
    } else {
      tokenCache.delete(key);
    }
    return mintAccessToken();
  }

  function throwUpstream(status: number, headers: Record<string, string>, body: string): never {
    const safeBody = redactGreenhouseSecrets(body, secrets);
    throw upstreamErrorFor("Greenhouse", status, headers, safeBody);
  }

  async function harvestRequest(
    method: "GET" | "POST" | "PATCH",
    path: string,
    init: { body?: string; contentType?: string } = {},
    retried = false,
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const accessToken = await getAccessToken(retried);
    if (!secrets.includes(accessToken)) secrets.push(accessToken);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    if (init.body != null) {
      headers["Content-Type"] = init.contentType ?? "application/json";
    }

    const response = await http.fetchText(`${HARVEST_BASE}${path}`, {
      method,
      headers,
      body: init.body,
    });

    if (response.status === 401 && !retried) {
      return harvestRequest(method, path, init, true);
    }
    return response;
  }

  async function parseJsonOrEmpty(response: {
    status: number;
    headers: Record<string, string>;
    body: string;
  }): Promise<unknown> {
    if (response.status < 200 || response.status >= 300) {
      throwUpstream(response.status, response.headers, response.body);
    }
    if (response.status === 204 || response.body.length === 0) {
      return undefined;
    }
    try {
      return JSON.parse(response.body);
    } catch {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Greenhouse returned a non-JSON body.",
      } satisfies ConnectorUpstreamError;
    }
  }

  return {
    async getJSON(path: string): Promise<unknown> {
      const response = await harvestRequest("GET", path);
      return parseJsonOrEmpty(response);
    },

    async getJSONWithMeta(path: string): Promise<{
      body: unknown;
      headers: Record<string, string>;
      nextCursor: string | null;
    }> {
      const response = await harvestRequest("GET", path);
      const body = await parseJsonOrEmpty(response);
      return {
        body,
        headers: response.headers,
        nextCursor: parseNextCursorFromLink(response.headers),
      };
    },

    async postJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      const response = await harvestRequest("POST", path, { body: JSON.stringify(body) });
      return parseJsonOrEmpty(response);
    },

    async patchJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      const response = await harvestRequest("PATCH", path, { body: JSON.stringify(body) });
      return parseJsonOrEmpty(response);
    },
  };
}
