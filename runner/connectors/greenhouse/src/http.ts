/**
 * Greenhouse HTTP client.
 *
 * Routed through the shared job-board client so this connector gets the runner's
 * outbound controls: the manifest host allowlist, blocked redirects, a bounded
 * response size and a request deadline. It previously called the global `fetch`
 * directly and had none of them.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface GreenhouseClientConfig {
  boardToken: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
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
