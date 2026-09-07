import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import {
  isConnectorHttpClient,
  isRecord,
  notionVersion,
  readJsonObject,
  requireString,
} from "./http";

export function hasLiveCredentialValidation(input: unknown): boolean {
  return isRecord(input) && (typeof input.fetch === "function" || isConnectorHttpClient(input.httpClient));
}

export async function validateCredentialsLive(input: unknown): Promise<Record<string, unknown>> {
  const credentials = validateCredentialInput(input);
  const httpClient = readHttpClient(input);
  const response = await httpClient.fetchText("https://api.notion.com/v1/users/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${credentials.notionToken}`,
      "Notion-Version": notionVersion,
    },
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return {
      connector: "notion",
      action: "credentials.validate",
      source: "connector",
      valid: false,
      error: mapNotionError(response.status, response.headers, body),
    };
  }

  return {
    connector: "notion",
    action: "credentials.validate",
    source: "connector",
    valid: true,
    workspaceUserId: typeof body.id === "string" ? body.id : undefined,
  };
}

export function validateCredentialInput(input: unknown): { notionToken: string } {
  if (!isRecord(input)) {
    throw new Error("credentials input must be an object");
  }
  const notionToken = requireString(input.notionToken, "notionToken").trim();
  if (notionToken.length === 0) {
    throw new Error("notionToken is required");
  }
  return { notionToken };
}

function readHttpClient(input: unknown): ConnectorHttpClient {
  if (isRecord(input) && isConnectorHttpClient(input.httpClient)) {
    return input.httpClient;
  }
  return createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["credentials.validate"].maxResponseBytes,
    fetch: isRecord(input) && typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
  });
}

function mapNotionError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  const providerError = typeof body.code === "string" ? body.code : undefined;
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    return {
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      providerError,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0,
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "AUTHENTICATION_FAILED",
      message: "Notion rejected the provided credentials.",
      providerError,
    };
  }
  return {
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: "Notion rejected the credential validation request.",
    providerError,
  };
}
