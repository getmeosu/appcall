import { describe, expect, test } from "bun:test";
import { errorResponseForExecutionFailure, statusForExecutionErrorCode } from "../src/server";

describe("errorResponseForExecutionFailure", () => {
  test("preserves a connector handler's structured upstream error", () => {
    const result = errorResponseForExecutionFailure(
      { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Brevo rejected the request." },
      "INVALID_ACTION_INPUT",
      "Action input is invalid.",
    );
    expect(result.status).toBe(502);
    expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    expect(result.error.message).toBe("Brevo rejected the request.");
  });

  test("preserves rate-limit and timeout codes with their statuses", () => {
    expect(errorResponseForExecutionFailure({ code: "CONNECTOR_RATE_LIMITED", message: "slow down" }, "X", "y").status).toBe(429);
    expect(errorResponseForExecutionFailure({ code: "OPERATION_TIMEOUT" }, "X", "y").status).toBe(504);
    expect(errorResponseForExecutionFailure({ code: "CONNECTOR_UNAVAILABLE" }, "X", "y").status).toBe(503);
  });

  test("falls back for an unstructured Error (real invalid input)", () => {
    const result = errorResponseForExecutionFailure(new Error("email is required"), "INVALID_ACTION_INPUT", "Action input is invalid.");
    expect(result.status).toBe(400);
    expect(result.error.code).toBe("INVALID_ACTION_INPUT");
    expect(result.error.message).toBe("email is required");
  });

  test("falls back to the supplied message for a non-Error throw", () => {
    const result = errorResponseForExecutionFailure("boom", "INVALID_ACTION_INPUT", "Action input is invalid.");
    expect(result.error.code).toBe("INVALID_ACTION_INPUT");
    expect(result.error.message).toBe("Action input is invalid.");
  });

  test("statusForExecutionErrorCode defaults unknown codes to 400", () => {
    expect(statusForExecutionErrorCode("SOMETHING_ELSE")).toBe(400);
  });

  test("statusForExecutionErrorCode maps account-restricted to 423 Locked", () => {
    expect(statusForExecutionErrorCode("CONNECTOR_ACCOUNT_RESTRICTED")).toBe(423);
  });

  test("statusForExecutionErrorCode maps action-not-permitted to 422", () => {
    expect(statusForExecutionErrorCode("CONNECTOR_ACTION_NOT_PERMITTED")).toBe(422);
  });
});
