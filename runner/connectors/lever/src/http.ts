/**
 * Lever HTTP clients.
 *
 * Two surfaces:
 * - Public postings (`createClient`) — jobs.list against /v0/postings/{site}
 * - Authenticated Data API (`createAuthClient`) — opportunities/stages/users
 *   against https://api.lever.{region}/v1 with HTTP Basic (apiKey as username,
 *   empty password). Matches the manifest http.auth.basic scheme.
 *
 * Both route through the shared job-board client for allowlist, redirect
 * blocking, response-size bounds, deadlines, and inject-fetch for tests.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
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

export function createAuthClient(config: LeverAuthClientConfig): JobBoardClient {
  const region = assertSafePathSegment(config.region, "region");
  if (region !== "co" && region !== "eu") {
    throw new Error('region must be "co" or "eu"');
  }
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new Error("apiKey is required");
  }
  const bounds = operationBounds(config.operation, "opportunities.list");
  return createJobBoardClient({
    provider: "Lever",
    baseUrl: `https://api.lever.${region}/v1`,
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
