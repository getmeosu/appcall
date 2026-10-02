/**
 * Greenhouse HTTP clients.
 *
 * Two surfaces:
 * - Public Job Board (`createClient`) — jobs.list against
 *   boards-api.greenhouse.io/v1/boards/{boardToken}
 * - Authenticated Harvest API (`createAuthClient`) — candidates/applications/users
 *   against https://harvest.greenhouse.io/v1 with HTTP Basic (apiKey as username,
 *   empty password). Matches the manifest http.auth.basic scheme.
 *
 * Both route through the shared outbound stack for allowlist, redirect blocking,
 * response-size bounds, deadlines, and inject-fetch for tests.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
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

export function createAuthClient(config: GreenhouseAuthClientConfig): JobBoardClient {
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new Error("apiKey is required");
  }
  const bounds = operationBounds(config.operation, "candidates.list");
  return createJobBoardClient({
    provider: "Greenhouse",
    baseUrl: "https://harvest.greenhouse.io/v1",
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: {
      Authorization: basicAuthHeader(config.apiKey),
      Accept: "application/json",
    },
    fetch: config.fetch,
  });
}
