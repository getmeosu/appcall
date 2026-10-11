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
import { createConnectorHttpClient } from "../../../bun/src/http";
import {
  createJobBoardClient,
  assertSafePathSegment,
  upstreamErrorFor,
  type JobBoardClient,
  type ConnectorUpstreamError,
} from "../../_shared/jobboard";
import manifest from "../manifest.json";
import { nextPageIdOf } from "./paging";

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

/**
 * G1 write-capable Customer API client (X-SmartToken on api.smartrecruiters.com).
 *
 * `request` sends any method with an optional JSON body (object or array) and
 * accepts every 2xx, including 201 Created and 204 No Content (returns
 * `undefined` when the body is empty). Non-2xx maps through upstreamErrorFor:
 * 429 → CONNECTOR_RATE_LIMITED, everything else (incl. 404) →
 * CONNECTOR_UPSTREAM_ERROR.
 */
export type SmartRecruitersApiClient = {
  getJSON(path: string): Promise<unknown>;
  /**
   * GET that also surfaces the next-page cursor: the body's `nextPageId` when
   * present, otherwise the `pageId` of the `Link` header's rel="next" URL.
   */
  getPage(path: string): Promise<{ data: unknown; nextPageId: string | null }>;
  request(
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    /** Defaults to application/json; jobs.update sends application/json-patch+json. */
    contentType?: string,
  ): Promise<unknown>;
};

export function createApiClient(config: SmartRecruitersAuthClientConfig): SmartRecruitersApiClient {
  if (typeof config.apiKey !== "string" || config.apiKey.length === 0) {
    throw new Error("apiKey is required");
  }
  const bounds = operationBounds(config.operation, "candidates.get");
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    fetch: config.fetch,
  });
  const base = "https://api.smartrecruiters.com";

  async function send(method: string, path: string, body?: unknown, contentType = "application/json"): Promise<unknown> {
    return (await sendWithHeaders(method, path, body, contentType)).data;
  }

  async function sendWithHeaders(
    method: string,
    path: string,
    body?: unknown,
    contentType = "application/json",
  ): Promise<{ data: unknown; headers: Record<string, string> }> {
    const headers: Record<string, string> = {
      "X-SmartToken": config.apiKey,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = contentType;
    const response = await http.fetchText(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw upstreamErrorFor("SmartRecruiters", response.status, response.headers, response.body);
    }
    if (response.status === 204 || response.body.trim().length === 0) {
      return { data: undefined, headers: response.headers };
    }
    try {
      return { data: JSON.parse(response.body), headers: response.headers };
    } catch {
      throw {
        ok: false,
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "SmartRecruiters returned a non-JSON body.",
      } satisfies ConnectorUpstreamError;
    }
  }

  return {
    getJSON: (path) => send("GET", path),
    getPage: async (path) => {
      const { data, headers } = await sendWithHeaders("GET", path);
      return { data, nextPageId: nextPageIdOf(data, headers.link ?? headers.Link ?? null) };
    },
    request: (method, path, body, contentType) => send(method, path, body, contentType),
  };
}
