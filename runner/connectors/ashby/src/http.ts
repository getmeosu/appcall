/**
 * Ashby HTTP clients.
 *
 * Two surfaces:
 * - Public posting-api job board (`createClient`) — jobs.list against
 *   /posting-api/job-board/{boardName}
 * - Authenticated API (`createAuthClient`) — candidates/applications against
 *   https://api.ashbyhq.com with HTTP Basic (apiKey as username, empty password).
 *   Matches the manifest http.auth.basic scheme. Ashby list/info endpoints are
 *   all POST + JSON body.
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

export interface AshbyClientConfig {
  boardName: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
}

export interface AshbyAuthClientConfig {
  apiKey: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
  /** Manifest operation key used for timeout / response-size bounds. */
  operation?: string;
}

export type AshbyAuthClient = {
  /** POST `path` with a JSON body relative to https://api.ashbyhq.com. */
  postJSON(path: string, body?: Record<string, unknown>): Promise<unknown>;
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
  // Ashby Basic auth: API key as username, empty password → base64("key:").
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

const jobsListOperation = manifest.operations["jobs.list"];

export function createClient(config: AshbyClientConfig): JobBoardClient {
  const boardName = assertSafePathSegment(config.boardName, "boardName");
  return createJobBoardClient({
    provider: "Ashby",
    baseUrl: `https://api.ashbyhq.com/posting-api/job-board/${boardName}`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: jobsListOperation.maxResponseBytes,
    timeoutMs: jobsListOperation.timeoutMs,
    fetch: config.fetch,
  });
}

export function createAuthClient(config: AshbyAuthClientConfig): AshbyAuthClient {
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
  const baseUrl = "https://api.ashbyhq.com";
  const authHeader = basicAuthHeader(config.apiKey);

  return {
    async postJSON(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
      const response = await http.fetchText(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json; version=1",
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor("Ashby", response.status, response.headers, response.body);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw {
          ok: false,
          code: "CONNECTOR_UPSTREAM_ERROR",
          message: "Ashby returned a non-JSON body.",
        } satisfies ConnectorUpstreamError;
      }
      // Ashby often returns HTTP 200 with { success: false, errors: [...] }.
      if (
        parsed != null &&
        typeof parsed === "object" &&
        (parsed as { success?: unknown }).success === false
      ) {
        const errors = (parsed as { errors?: Array<{ message?: string }> }).errors;
        const message =
          Array.isArray(errors) && errors[0]?.message
            ? errors[0].message
            : "Ashby API returned success=false.";
        throw {
          ok: false,
          code: "CONNECTOR_UPSTREAM_ERROR",
          message: `Ashby API error: ${message}`,
        } satisfies ConnectorUpstreamError;
      }
      return parsed;
    },
  };
}
