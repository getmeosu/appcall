/**
 * SmartRecruiters HTTP clients.
 *
 * Two surfaces:
 * - Public company postings (`createClient`) — jobs.list / postings.list against
 *   api.smartrecruiters.com/v1/companies/{company}
 * - Authenticated Customer API (`createAuthClient`) — jobs.get, candidates,
 *   users, interviews against https://api.smartrecruiters.com with X-SmartToken
 *   header. Matches the manifest http.auth scheme (field apiKey → header X-SmartToken).
 *
 * Both route through the shared outbound stack for allowlist, redirect blocking,
 * response-size bounds, deadlines, and inject-fetch for tests.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface SmartRecruitersClientConfig {
  company: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
}

export interface SmartRecruitersAuthClientConfig {
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

const jobsListOperation = manifest.operations["jobs.list"];

export function createClient(config: SmartRecruitersClientConfig): JobBoardClient {
  const company = assertSafePathSegment(config.company, "company");
  return createJobBoardClient({
    provider: "SmartRecruiters",
    baseUrl: `https://api.smartrecruiters.com/v1/companies/${company}`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: jobsListOperation.maxResponseBytes,
    timeoutMs: jobsListOperation.timeoutMs,
    fetch: config.fetch,
  });
}

export function createAuthClient(config: SmartRecruitersAuthClientConfig): JobBoardClient {
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new Error("apiKey is required");
  }
  const bounds = operationBounds(config.operation, "candidates.list");
  return createJobBoardClient({
    provider: "SmartRecruiters",
    baseUrl: "https://api.smartrecruiters.com",
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: {
      "X-SmartToken": config.apiKey,
      Accept: "application/json",
    },
    fetch: config.fetch,
  });
}
