/**
 * Workable HTTP client.
 *
 * SPI base is `https://{account}.workable.com/spi/v3` (account subdomain). Routed
 * through the shared job-board client so this connector gets the runner's outbound
 * controls: the manifest host allowlist (`*.workable.com`), blocked redirects, a
 * bounded response size and a request deadline, plus inject-fetch for tests.
 */
import { createJobBoardClient, assertSafePathSegment, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface WorkableClientConfig {
  account: string;
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

export function createClient(config: WorkableClientConfig): JobBoardClient {
  const account = assertSafePathSegment(config.account, "account");
  const bounds = operationBounds(config.operation, "jobs.list");
  return createJobBoardClient({
    provider: "Workable",
    baseUrl: `https://${account}.workable.com/spi/v3`,
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    fetch: config.fetch,
  });
}
