/**
 * Intercom HTTP client.
 *
 * Authenticated REST against https://api.intercom.io with Bearer {{accessToken}}
 * and Intercom-Version from the manifest (2.13). Routes through the shared
 * outbound stack for allowlist, redirect blocking, response-size bounds,
 * deadlines, and inject-fetch for tests.
 */
import { createConnectorHttpClient } from "../../../bun/src/http";
import {
  upstreamErrorFor,
  type ConnectorUpstreamError,
} from "../../_shared/jobboard";
import manifest from "../manifest.json";

export interface IntercomAuthClientConfig {
  accessToken: string;
  /** Injected by tests; production leaves it unset and the real fetch is used. */
  fetch?: typeof fetch;
  /** Manifest operation key used for timeout / response-size bounds. */
  operation?: string;
}

export type IntercomAuthClient = {
  /** GET `path` relative to https://api.intercom.io and parse JSON. */
  getJSON(path: string): Promise<unknown>;
  /** POST `path` with a JSON body relative to https://api.intercom.io. */
  postJSON(path: string, body?: Record<string, unknown> | null): Promise<unknown>;
};

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

function parseJSONBody(provider: string, body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `${provider} returned a non-JSON body.`,
    } satisfies ConnectorUpstreamError;
  }
}

export function createAuthClient(config: IntercomAuthClientConfig): IntercomAuthClient {
  if (typeof config.accessToken !== "string" || config.accessToken.length === 0) {
    throw new Error("accessToken is required");
  }
  const bounds = operationBounds(config.operation, "contacts.list");
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: bounds.maxResponseBytes,
    timeoutMs: bounds.timeoutMs,
    fetch: config.fetch,
  });
  const baseUrl = "https://api.intercom.io";
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.accessToken}`,
    "Intercom-Version":
      (manifest.http?.headers as { "Intercom-Version"?: string } | undefined)?.[
        "Intercom-Version"
      ] ?? "2.13",
  };

  return {
    async getJSON(path: string): Promise<unknown> {
      const response = await http.fetchText(`${baseUrl}${path}`, {
        method: "GET",
        headers,
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor("Intercom", response.status, response.headers, response.body);
      }
      return parseJSONBody("Intercom", response.body);
    },

    async postJSON(path: string, body: Record<string, unknown> | null = {}): Promise<unknown> {
      const response = await http.fetchText(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: body == null ? undefined : JSON.stringify(body),
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor("Intercom", response.status, response.headers, response.body);
      }
      return parseJSONBody("Intercom", response.body);
    },
  };
}
