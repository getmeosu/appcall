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

export type LeverAuthClient = {
  /** GET `path` relative to https://api.lever.{region}/v1 and parse JSON. */
  getJSON(path: string): Promise<unknown>;
  /** PUT `path` with a JSON body relative to https://api.lever.{region}/v1. */
  putJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
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
  const headers = {
    Authorization: basicAuthHeader(config.apiKey),
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  return {
    async getJSON(path: string): Promise<unknown> {
      const response = await http.fetchText(`${baseUrl}${path}`, {
        method: "GET",
        headers,
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor("Lever", response.status, response.headers, response.body);
      }
      return parseJSONBody("Lever", response.body);
    },

    async putJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      const response = await http.fetchText(`${baseUrl}${path}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor("Lever", response.status, response.headers, response.body);
      }
      if (response.status === 204 || response.body.length === 0) {
        return undefined;
      }
      return parseJSONBody("Lever", response.body);
    },
  };
}
