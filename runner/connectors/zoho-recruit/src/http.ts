/**
 * Zoho Recruit HTTP client.
 *
 * Routed through the shared job-board client so this connector gets the runner's
 * outbound controls: the manifest host allowlist, blocked redirects, a bounded
 * response size and a request deadline. Auth header is Zoho-oauthtoken.
 *
 * Soft residual: multi-DC hosts (recruit.zoho.eu, …) are not expanded here —
 * allowedHosts stays recruit.zoho.com unless a later slice adds DC routing.
 */
import { createJobBoardClient, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface ZohoRecruitClientConfig {
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

export function createClient(config: ZohoRecruitClientConfig): JobBoardClient {
  const bounds = operationBounds(config.operation, "jobs.list");
  return createJobBoardClient({
    provider: "Zoho Recruit",
    baseUrl: "https://recruit.zoho.com/recruit/v2",
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: {
      Authorization: `Zoho-oauthtoken ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    fetch: config.fetch,
  });
}
