import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { capabilityFailureFields, errorResponseForExecutionFailure, handleRPC, statusForExecutionErrorCode } from "../src/server";
import { defaultConnectorRegistry } from "../src/registry";

// SRV-ERR-1: CONNECTOR_CAPABILITY_MISSING maps to HTTP 403 and carries the
// optional reason / missingScopes / requiredScopes / reconsentRequired fields
// connectors attach (meta-ads, linkedin-ads, tiktok-ads), omitted when absent.

const permissionMissing = {
  ok: false,
  code: "CONNECTOR_CAPABILITY_MISSING",
  message: "Meta Ads permission missing for leads.list.",
  reason: "permission_missing",
  missingScopes: ["leads_retrieval"],
  requiredScopes: ["leads_retrieval", "pages_manage_ads"],
  reconsentRequired: true,
};

describe("SRV-ERR-1 status mapping", () => {
  test("CONNECTOR_CAPABILITY_MISSING maps to 403", () => {
    expect(statusForExecutionErrorCode("CONNECTOR_CAPABILITY_MISSING")).toBe(403);
  });

  test("existing statuses are unchanged", () => {
    expect(statusForExecutionErrorCode("CONNECTOR_RATE_LIMITED")).toBe(429);
    expect(statusForExecutionErrorCode("CONNECTOR_UPSTREAM_ERROR")).toBe(502);
    expect(statusForExecutionErrorCode("CONNECTOR_ACTION_NOT_PERMITTED")).toBe(422);
    expect(statusForExecutionErrorCode("SOMETHING_ELSE")).toBe(400);
  });
});

describe("SRV-ERR-1 capability fields", () => {
  test("all four fields pass through after message", () => {
    const result = errorResponseForExecutionFailure(permissionMissing, "X", "y");
    expect(result.status).toBe(403);
    expect(result.error).toEqual({
      code: "CONNECTOR_CAPABILITY_MISSING",
      message: "Meta Ads permission missing for leads.list.",
      reason: "permission_missing",
      missingScopes: ["leads_retrieval"],
      requiredScopes: ["leads_retrieval", "pages_manage_ads"],
      reconsentRequired: true,
    });
    expect(Object.keys(result.error)).toEqual(["code", "message", "reason", "missingScopes", "requiredScopes", "reconsentRequired"]);
  });

  test("tombstone shape (TikTok removed_upstream, no missingScopes, reconsentRequired false)", () => {
    const result = errorResponseForExecutionFailure(
      { ok: false, code: "CONNECTOR_CAPABILITY_MISSING", message: "removed", reason: "removed_upstream", requiredScopes: ["tcm"], reconsentRequired: false },
      "X",
      "y",
    );
    expect(result.status).toBe(403);
    expect(result.error).toEqual({ code: "CONNECTOR_CAPABILITY_MISSING", message: "removed", reason: "removed_upstream", requiredScopes: ["tcm"], reconsentRequired: false });
  });

  for (const field of ["reason", "missingScopes", "requiredScopes", "reconsentRequired"] as const) {
    test(`${field} present alone is passed through`, () => {
      const error = { code: "CONNECTOR_CAPABILITY_MISSING", message: "m", [field]: permissionMissing[field] };
      expect(errorResponseForExecutionFailure(error, "X", "y").error).toEqual({ code: "CONNECTOR_CAPABILITY_MISSING", message: "m", [field]: permissionMissing[field] });
    });

    test(`${field} absent is omitted (no key, not undefined)`, () => {
      const { [field]: _omitted, ...error } = permissionMissing;
      const result = errorResponseForExecutionFailure(error, "X", "y");
      expect(field in result.error).toBe(false);
      expect(JSON.stringify(result.error)).not.toContain(`"${field}"`);
    });
  }

  test("no optional fields: body is just code + message", () => {
    const result = errorResponseForExecutionFailure({ code: "CONNECTOR_CAPABILITY_MISSING", message: "m" }, "X", "y");
    expect(result).toEqual({ status: 403, error: { code: "CONNECTOR_CAPABILITY_MISSING", message: "m" } });
    expect(JSON.stringify(result.error)).toBe('{"code":"CONNECTOR_CAPABILITY_MISSING","message":"m"}');
  });

  test("malformed field types are dropped, not coerced", () => {
    expect(capabilityFailureFields({ reason: "", missingScopes: "leads", requiredScopes: ["ok", 3], reconsentRequired: "yes" })).toEqual({});
    expect(capabilityFailureFields({ reason: 7, missingScopes: [{}], reconsentRequired: 1 })).toEqual({});
    expect(capabilityFailureFields({ missingScopes: [], requiredScopes: [] })).toEqual({ missingScopes: [], requiredScopes: [] });
  });

  test("other codes are byte-identical even if they carry these field names", () => {
    const upstream = errorResponseForExecutionFailure({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Bad", reason: "x", requiredScopes: ["a"], reconsentRequired: true }, "X", "y");
    expect(JSON.stringify(upstream)).toBe('{"status":502,"error":{"code":"CONNECTOR_UPSTREAM_ERROR","message":"Bad"}}');
    const limited = errorResponseForExecutionFailure({ code: "CONNECTOR_RATE_LIMITED", message: "slow", retryAfterSeconds: 30, missingScopes: ["a"] }, "X", "y");
    expect(JSON.stringify(limited)).toBe('{"status":429,"error":{"code":"CONNECTOR_RATE_LIMITED","retryAfterSeconds":30,"message":"slow"}}');
  });

  test("retryAfterSeconds keeps its slot before message when capability fields are present", () => {
    const result = errorResponseForExecutionFailure({ ...permissionMissing, retryAfterSeconds: 5 }, "X", "y");
    expect(Object.keys(result.error)).toEqual(["code", "retryAfterSeconds", "message", "reason", "missingScopes", "requiredScopes", "reconsentRequired"]);
  });
});

describe("SRV-ERR-1 over handleRPC", () => {
  const original = defaultConnectorRegistry.executeAction;
  afterEach(() => {
    defaultConnectorRegistry.executeAction = original;
    (console.error as any).mockRestore?.();
  });

  const call = (rejection: unknown) => {
    spyOn(console, "error").mockImplementation(() => {});
    defaultConnectorRegistry.executeAction = () => ({ ok: true, output: Promise.reject(rejection) });
    return handleRPC(new Request("http://runner.local/rpc", {
      method: "POST",
      body: JSON.stringify({ id: "req_srv_err_1", method: "connector.action.execute", params: { connectorKey: "fake", action: "messages.send", input: {} } }),
    }));
  };

  test("rejected capability failure returns 403 with all fields on the wire", async () => {
    const response = await call(permissionMissing);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      id: "req_srv_err_1",
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Meta Ads permission missing for leads.list.",
        reason: "permission_missing",
        missingScopes: ["leads_retrieval"],
        requiredScopes: ["leads_retrieval", "pages_manage_ads"],
        reconsentRequired: true,
      },
    });
  });

  test("rejected capability failure without fields returns bare code + message", async () => {
    const response = await call({ ok: false, code: "CONNECTOR_CAPABILITY_MISSING", message: "missing" });
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('{"id":"req_srv_err_1","ok":false,"error":{"code":"CONNECTOR_CAPABILITY_MISSING","message":"missing"}}');
  });

  test("existing upstream error body is byte-identical", async () => {
    const response = await call({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Brevo rejected the request.", reason: "ignored" });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"id":"req_srv_err_1","ok":false,"error":{"code":"CONNECTOR_UPSTREAM_ERROR","message":"Brevo rejected the request."}}');
  });
});
