/**
 * Recruitee HTTP clients.
 *
 * Careers Site API (`https://{company}.recruitee.com/api`) powers the public
 * job board sync (`jobs.list`). Authenticated ATS API
 * (`https://api.recruitee.com/c/{company}`) powers candidates / offers / stages.
 * Company path segment may be a numeric company id or the company subdomain
 * (Recruitee accepts both). Both routes go through the shared job-board client
 * so the runner still owns host allowlist, redirect blocking, response size and
 * deadline, plus inject-fetch for tests.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface RecruiteeClientConfig {
  company: string;
  accessToken: string;
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

/** Careers Site API client — used by jobs.list (NormalizedJob from /offers). */
export function createClient(config: RecruiteeClientConfig): JobBoardClient {
  const company = assertSafePathSegment(config.company, "company");
  const bounds = operationBounds(config.operation, "jobs.list");
  return createJobBoardClient({
    provider: "Recruitee",
    baseUrl: `https://${company}.recruitee.com/api`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    fetch: config.fetch,
  });
}

/** Authenticated ATS API client — candidates, offers, pipeline stages. */
export function createAtsClient(config: RecruiteeClientConfig): JobBoardClient {
  const company = assertSafePathSegment(config.company, "company");
  const bounds = operationBounds(config.operation, "candidates.list");
  return createJobBoardClient({
    provider: "Recruitee",
    baseUrl: `https://api.recruitee.com/c/${company}`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    fetch: config.fetch,
  });
}
