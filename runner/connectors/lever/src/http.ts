/**
 * Lever HTTP clients.
 *
 * Two surfaces:
 * - Public postings (`createClient`) — jobs.list against /v0/postings/{site}
 * - Authenticated Data API (`createAuthClient`) — opportunities/stages/users/
 *   archive_reasons against https://api.lever.{region}/v1 with HTTP Basic
 *   (apiKey as username, empty password). Matches the manifest http.auth.basic
 *   scheme. Exposes getJSON + putJSON for read and write depth.
 *
 * Both route through the shared outbound stack for allowlist, redirect
 * blocking, response-size bounds, deadlines, and inject-fetch for tests.
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

export interface LeverClientConfig {
  site: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
}

export interface LeverAuthClientConfig {
  apiKey: string;
  /** Lever region host suffix: "co" (US) or "eu". */
  region: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
  /** Manifest operation key used for timeout / response-size bounds. */
  operation?: string;
}

export type LeverHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type LeverRawResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type LeverAuthClient = {
  /** GET `path` relative to https://api.lever.{region}/v1 and parse JSON. */
  getJSON(path: string): Promise<unknown>;
  /** PUT `path` with a JSON body relative to https://api.lever.{region}/v1. */
  putJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
  /** POST `path` with an optional JSON body. 204/empty → undefined. */
  postJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
  /** DELETE `path` with an optional JSON body (dropdown option deletes). */
  deleteJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
  /** JSON GET/POST/PUT/DELETE. */
  requestJSON(method: LeverHttpMethod, path: string, body?: Record<string, unknown>): Promise<unknown>;
  /**
   * Raw request for multipart uploads and file downloads. Does not force
   * Content-Type: application/json; callers set headers as needed.
   */
  requestRaw(
    method: string,
    path: string,
    init?: { body?: BodyInit; headers?: Record<string, string> },
  ): Promise<LeverRawResponse>;
};

type OperationBounds = { maxResponseBytes: number; timeoutMs: number };

function operationBounds(operation: string | undefined, fallback: string): OperationBounds {
  const ops = manifest.operations as Record<string, Partial<OperationBounds>>;
  const primary = operation ? ops[operation] : undefined;
  const secondary = ops[fallback];
  return {
    maxResponseBytes: primary?.maxResponseBytes ?? secondary?.maxResponseBytes ?? 5_242_880,
    timeoutMs: primary?.timeoutMs ?? secondary?.timeoutMs ?? 30_000,
  };
}

function basicAuthHeader(apiKey: string): string {
  // Lever Basic auth: API key as username, empty password → base64("key:").
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function parseJSONBody(provider: string, body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `${provider} returned a non-JSON body.`,
    } satisfies ConnectorUpstreamError;
  }
}

export function createClient(config: LeverClientConfig): JobBoardClient {
  const site = assertSafePathSegment(config.site, "site");
  const bounds = operationBounds("jobs.list", "jobs.list");
  return createJobBoardClient({
    provider: "Lever",
    baseUrl: `https://api.lever.co/v0/postings/${site}`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    fetch: config.fetch,
  });
}

export function createAuthClient(config: LeverAuthClientConfig): LeverAuthClient {
  const region = assertSafePathSegment(config.region, "region");
  if (region !== "co" && region !== "eu") {
    throw new Error('region must be "co" or "eu"');
  }
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new Error("apiKey is required");
  }
  const bounds = operationBounds(config.operation, "opportunities.list");
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    fetch: config.fetch,
  });
  const baseUrl = `https://api.lever.${region}/v1`;
  const authHeader = basicAuthHeader(config.apiKey);
  const jsonHeaders = {
    Authorization: authHeader,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  async function sendJSON(
    method: LeverHttpMethod,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const init: RequestInit = {
      method,
      headers: body === undefined && method !== "PUT" ? { Authorization: authHeader, Accept: "application/json" } : jsonHeaders,
    };
    if (body !== undefined || method === "PUT") {
      init.headers = jsonHeaders;
      init.body = JSON.stringify(body ?? {});
    }
    const response = await http.fetchText(`${baseUrl}${path}`, init);
    if (response.status < 200 || response.status >= 300) {
      throw upstreamErrorFor("Lever", response.status, response.headers, response.body);
    }
    if (response.status === 204 || response.body.length === 0) {
      return undefined;
    }
    return parseJSONBody("Lever", response.body);
  }

  return {
    async getJSON(path: string): Promise<unknown> {
      return sendJSON("GET", path);
    },

    async putJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      return sendJSON("PUT", path, body);
    },

    async postJSON(path: string, body?: Record<string, unknown>): Promise<unknown> {
      return sendJSON("POST", path, body);
    },

    async deleteJSON(path: string, body?: Record<string, unknown>): Promise<unknown> {
      return sendJSON("DELETE", path, body);
    },

    async requestJSON(method: LeverHttpMethod, path: string, body?: Record<string, unknown>): Promise<unknown> {
      return sendJSON(method, path, body);
    },

    async requestRaw(
      method: string,
      path: string,
      init: { body?: BodyInit; headers?: Record<string, string> } = {},
    ): Promise<LeverRawResponse> {
      const headers: Record<string, string> = {
        Authorization: authHeader,
        Accept: "application/json",
        ...(init.headers ?? {}),
      };
      const response = await http.fetchText(`${baseUrl}${path}`, {
        method,
        headers,
        body: init.body,
      });
      return { status: response.status, headers: response.headers, body: response.body };
    },
  };
}
