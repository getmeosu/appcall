// runner/sena-e2e/client.ts
// Minimal typed appcall client for the two surfaces Sena uses:
//   - MCP gateway (POST /v1/mcp) for stored-credential connectors
//   - raw action endpoint (POST /v1/connections/:id/actions/:action) for the
//     external_bearer booking call, carrying X-Connector-Token.
import type { HarnessConfig } from "./config";

export interface CallResult {
  ok: boolean;
  requestId: string;
  output: unknown;
  errorCode?: string;
  raw: unknown;
}

function baseHeaders(cfg: HarnessConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": cfg.apiKey,
    "X-External-Account-Id": cfg.externalAccountId,
    "X-Capability-Profile": cfg.capabilityProfile,
  };
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { __parseError: true, status: res.status, statusText: res.statusText, body: text.slice(0, 2000) };
  }
}

let rpcId = 0;

export async function mcpCall(cfg: HarnessConfig, tool: string, args: unknown): Promise<CallResult> {
  const body = { jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: args } };
  const res = await fetch(`${cfg.baseUrl}/v1/mcp`, {
    method: "POST",
    headers: baseHeaders(cfg),
    body: JSON.stringify(body),
  });
  const json: any = await readJson(res);
  const result = json?.result ?? {};
  return {
    ok: res.ok && !result.isError,
    requestId: result?.structuredContent?.requestId ?? "",
    errorCode: result?.structuredContent?.code,
    output: result?.structuredContent ?? result?.content,
    raw: json,
  };
}

export async function mcpListTools(cfg: HarnessConfig): Promise<string[]> {
  const body = { jsonrpc: "2.0", id: ++rpcId, method: "tools/list" };
  const res = await fetch(`${cfg.baseUrl}/v1/mcp`, { method: "POST", headers: baseHeaders(cfg), body: JSON.stringify(body) });
  const json: any = await readJson(res);
  return (json?.result?.tools ?? []).map((t: any) => t.name);
}

export async function listConnections(cfg: HarnessConfig): Promise<Array<{ id: string; connector: string; status: string }>> {
  const res = await fetch(`${cfg.baseUrl}/v1/connections`, { method: "GET", headers: baseHeaders(cfg) });
  const json: any = await readJson(res);
  return Array.isArray(json) ? json : (json?.connections ?? []);
}

export async function actionCall(
  cfg: HarnessConfig,
  connectionId: string,
  action: string,
  input: unknown,
  connectorToken?: string,
): Promise<CallResult> {
  const headers = baseHeaders(cfg);
  if (connectorToken) headers["X-Connector-Token"] = connectorToken;
  const res = await fetch(`${cfg.baseUrl}/v1/connections/${connectionId}/actions/${action}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
  });
  const json: any = await readJson(res);
  return {
    ok: res.ok && !json?.error,
    requestId: json?.requestId ?? "",
    errorCode: json?.error?.code,
    output: json?.output,
    raw: json,
  };
}
