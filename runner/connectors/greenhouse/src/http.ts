/**
 * Greenhouse HTTP clients.
 *
 * Two surfaces:
 * - Public Job Board (`createClient`) — jobs.list against
 *   boards-api.greenhouse.io/v1/boards/{boardToken}
 * - Authenticated Harvest API (`createAuthClient`) — candidates/applications/users
 *   against https://harvest.greenhouse.io/v3 with HTTP Basic (apiKey as username,
 *   empty password). Matches the manifest http.auth.basic scheme.
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
  apiKey: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
  /** Manifest operation key used for timeout / response-size bounds. */
  operation?: string;
}

export type GreenhouseAuthClient = {
  /** GET `path` relative to the Harvest v3 base URL and parse JSON. */
  getJSON(path: string): Promise<unknown>;
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
  // Harvest Basic auth: API key as username, empty password → base64("key:").
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

const HARVEST_BASE = "https://harvest.greenhouse.io/v3";

const jobsListOperation = manifest.operations["jobs.list"];

export function createClient(config: GreenhouseClientConfig): JobBoardClient {
  const boardToken = assertSafePathSegment(config.boardToken, "boardToken");
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
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new Error("apiKey is required");
  }
  const bounds = operationBounds(config.operation, "candidates.list");
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    fetch: config.fetch,
  });
  const authHeader = basicAuthHeader(config.apiKey);

  async function writeJSON(
    method: "POST" | "PATCH",
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await http.fetchText(`${HARVEST_BASE}${path}`, {
      method,
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw upstreamErrorFor("Greenhouse", response.status, response.headers, response.body);
    }
    // Move/reject and similar writes return 204 No Content.
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
      const response = await http.fetchText(`${HARVEST_BASE}${path}`, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor("Greenhouse", response.status, response.headers, response.body);
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
    },

    async postJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      return writeJSON("POST", path, body);
    },

    async patchJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      return writeJSON("PATCH", path, body);
    },
  };
}
