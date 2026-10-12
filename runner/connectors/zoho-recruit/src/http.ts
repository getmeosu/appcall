/**
 * Zoho Recruit HTTP client.
 *
 * Routed through the shared job-board client so this connector gets the runner's
 * outbound controls: the manifest host allowlist, blocked redirects, a bounded
 * response size and a request deadline. Auth header is Zoho-oauthtoken.
 *
 * Data centre (ZR-0/ZR-1): the base URL comes only from the allowlisted table in
 * ./datacenter (connect-time `dataCenter`, default "com" = recruit.zoho.com,
 * unchanged; other DCs use recruit.<dc>). The client's host allowlist is that
 * single DC host. A token-response api_domain, when present, must match that data
 * centre before any request is built; it is never used as a request host.
 */
import { createJobBoardClient, type JobBoardClient } from "../../_shared/jobboard";
import manifest from "../manifest.json";
import { apiHostFor, assertApiDomainMatches, dataCenterConfig, resolveDataCenter } from "./datacenter";

export interface ZohoRecruitClientConfig {
  accessToken: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
  /** Manifest operation key used for timeout / response-size bounds. */
  operation?: string;
  /** Connect-time data centre (allowlisted key); absent → "com". */
  dataCenter?: unknown;
  /** api_domain values from Zoho's token response, if the stored credentials carry them. */
  apiDomains?: unknown[];
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
  const dc = resolveDataCenter(config.dataCenter);
  for (const apiDomain of config.apiDomains ?? []) assertApiDomainMatches(dc, apiDomain);
  return createJobBoardClient({
    provider: "Zoho Recruit",
    baseUrl: dataCenterConfig(dc).apiBaseUrl,
    // Narrower than the manifest list: one connection reaches only its own DC.
    allowedHosts: [apiHostFor(dc)],
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    headers: {
      Authorization: `Zoho-oauthtoken ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    fetch: config.fetch,
  });
}
