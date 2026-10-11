import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { assertSafePathSegment, assertSafePathSegments } from "../../../bun/src/declarative/template";
import type { CompiledHandler } from "../../../bun/src/declarative/types";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  timeoutMs?: number;
  maxResponseBytes?: number;
  inputSchema?: Record<string, unknown>;
}>;
const credentialKeys = new Set(["apiKey", "fetch"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function encodeSegment(path: string, offset: number, matchLength: number, value: string): string {
  const encoded = encodeURIComponent(value);
  assertSafePathSegment(path, offset, matchLength, encoded);
  return encoded;
}

function oneIdentifier(values: Array<string | undefined>, labels: string[]): string {
  const present = values.map((value, index) => (typeof value === "string" && value.length > 0 ? labels[index] : null)).filter((label): label is string => label !== null);
  if (present.length === 0) invalidInput(`Provide exactly one of ${labels.join(", ")}.`);
  if (present.length > 1) invalidInput(`Provide exactly one of ${labels.join(", ")}; received ${present.join(" and ")}.`);
  return values[labels.indexOf(present[0]!)]!;
}

function workosClient(input: Record<string, unknown>, operation: { timeoutMs?: number; maxResponseBytes?: number }) {
  return createConnectorHttpClient({
    allowedHosts: ["api.workos.com"],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
  });
}

async function workosGet(key: string, path: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const operation = operations[key] ?? {};
  const client = workosClient(input, operation);
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(`https://api.workos.com${path}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${input.apiKey}` },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status === 429) {
    const retry = Number.parseInt(response.headers["retry-after"] ?? "", 10);
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "WorkOS rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) ? retry : 30,
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "WorkOS rejected the request." };
  }
  if (response.body.trim() === "") throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned an empty response." };
  let parsed: unknown;
  try { parsed = JSON.parse(response.body); }
  catch { throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." }; }
  return { connector: "workos", action: key, source: "provider", data: parsed };
}

function getHandler(key: "organizations.get" | "users.get"): CompiledHandler {
  const operation = operations[key] ?? {};
  return function execute(inputValue: unknown) {
    const record = isRecord(inputValue) ? inputValue : {};
    if (typeof record.apiKey !== "string") {
      validateStrictInput(record, operation.inputSchema ?? { type: "object" }, credentialKeys);
      return { connector: "workos", action: key, source: "connector", validated: true };
    }
    let validated: Record<string, unknown>;
    try {
      validated = validateStrictInput(record, operation.inputSchema ?? { type: "object" }, credentialKeys);
    } catch (error) {
      invalidInput(error instanceof Error ? error.message : "Action input is invalid.");
    }
    const input = { ...record, ...validated };
    if (key === "organizations.get") {
      const id = oneIdentifier(
        [typeof input.id === "string" ? input.id : undefined, typeof input.organization_id === "string" ? input.organization_id : undefined, typeof input.external_id === "string" ? input.external_id : undefined],
        ["id", "organization_id", "external_id"],
      );
      if (typeof input.external_id === "string" && input.external_id === id) {
        const template = "/organizations/external_id/{{external_id}}";
        const encoded = encodeSegment(template, "/organizations/external_id/".length, "{{external_id}}".length, id);
        const path = `/organizations/external_id/${encoded}`;
        assertSafePathSegments(path);
        return workosGet(key, path, input);
      }
      const template = "/organizations/{{id}}";
      const encoded = encodeSegment(template, "/organizations/".length, "{{id}}".length, id);
      const path = `/organizations/${encoded}`;
      assertSafePathSegments(path);
      return workosGet(key, path, input);
    }
    const id = oneIdentifier(
      [typeof input.id === "string" ? input.id : undefined, typeof input.user_id === "string" ? input.user_id : undefined, typeof input.external_id === "string" ? input.external_id : undefined],
      ["id", "user_id", "external_id"],
    );
    if (typeof input.external_id === "string" && input.external_id === id) {
      const template = "/user_management/users/external_id/{{external_id}}";
      const encoded = encodeSegment(template, "/user_management/users/external_id/".length, "{{external_id}}".length, id);
      const path = `/user_management/users/external_id/${encoded}`;
      assertSafePathSegments(path);
      return workosGet(key, path, input);
    }
    const template = "/user_management/users/{{id}}";
    const encoded = encodeSegment(template, "/user_management/users/".length, "{{id}}".length, id);
    const path = `/user_management/users/${encoded}`;
    assertSafePathSegments(path);
    return workosGet(key, path, input);
  };
}

function setStatusHandler(): CompiledHandler {
  const key = "organization_memberships.set_status";
  const operation = operations[key] ?? {};
  return function execute(inputValue: unknown) {
    const record = isRecord(inputValue) ? inputValue : {};
    if (typeof record.apiKey !== "string") {
      validateStrictInput(record, operation.inputSchema ?? { type: "object" }, credentialKeys);
      return { connector: "workos", action: key, source: "connector", validated: true };
    }
    let validated: Record<string, unknown>;
    try {
      validated = validateStrictInput(record, operation.inputSchema ?? { type: "object" }, credentialKeys);
    } catch (error) {
      invalidInput(error instanceof Error ? error.message : "Action input is invalid.");
    }
    const input = { ...record, ...validated };
    const membershipId = typeof input.membership_id === "string" ? input.membership_id : "";
    const status = input.status;
    if (!membershipId) invalidInput("membership_id is required");
    if (status !== "active" && status !== "inactive") invalidInput("status must be active or inactive");
    const suffix = status === "active" ? "reactivate" : "deactivate";
    const template = `/user_management/organization_memberships/{{membership_id}}/${suffix}`;
    const encoded = encodeSegment(template, "/user_management/organization_memberships/".length, "{{membership_id}}".length, membershipId);
    const path = `/user_management/organization_memberships/${encoded}/${suffix}`;
    assertSafePathSegments(path);
    const client = workosClient(input, operation);
    return (async () => {
      let response: { status: number; headers: Record<string, string>; body: string };
      try {
        response = await client.fetchText(`https://api.workos.com${path}`, {
          method: "PUT",
          headers: { Accept: "application/json", Authorization: `Bearer ${input.apiKey}` },
        });
      } catch (error) {
        if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
        throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
      }
      if (response.status === 429) {
        const retry = Number.parseInt(response.headers["retry-after"] ?? "", 10);
        throw {
          ok: false,
          code: "CONNECTOR_RATE_LIMITED",
          message: "WorkOS rate limit exceeded.",
          retryAfterSeconds: Number.isFinite(retry) ? retry : 30,
        };
      }
      if (response.status < 200 || response.status >= 300) {
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "WorkOS rejected the request." };
      }
      if (response.body.trim() === "") throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned an empty response." };
      let parsed: unknown;
      try { parsed = JSON.parse(response.body); }
      catch { throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." }; }
      return { connector: "workos", action: key, source: "provider", data: parsed };
    })();
  };
}

export function createWorkosActionHandlers(): Record<string, CompiledHandler> {
  return {
    "organizations.get": getHandler("organizations.get"),
    "users.get": getHandler("users.get"),
    "organization_memberships.set_status": setStatusHandler(),
  };
}
