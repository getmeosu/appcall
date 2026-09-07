/**
 * Workable HTTP client.
 *
 * Routed through the shared job-board client so this connector gets the runner's
 * outbound controls: the manifest host allowlist, blocked redirects, a bounded
 * response size and a request deadline. It previously called the global `fetch`
 * directly and had none of them.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface WorkableClientConfig {
  account: string;
  accessToken: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
}

const jobsListOperation = manifest.operations["jobs.list"];

export function createClient(config: WorkableClientConfig): JobBoardClient {
  const account = assertSafePathSegment(config.account, "account");
  return createJobBoardClient({
    provider: "Workable",
    baseUrl: `https://www.workable.com/spi/v3/accounts/${account}`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: jobsListOperation.maxResponseBytes,
    timeoutMs: jobsListOperation.timeoutMs,
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    fetch: config.fetch,
  });
}
