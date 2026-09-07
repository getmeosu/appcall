import { describe, expect, test } from "bun:test";
import runNormalizedFixture from "../fixtures/run_normalized.json";
import { normalizeRun, parseRunResponse } from "../src/objects";

// ---------------------------------------------------------------------------
// normalizeRun
// ---------------------------------------------------------------------------

describe("normalizeRun", () => {
  test("normalizes a full run from fixture data", () => {
    const raw = runNormalizedFixture.data;
    const result = normalizeRun(raw);

    expect(result).toEqual({
      id: "HG7ML7M8z78YcAPEB",
      provider: "apify",
      status: "SUCCEEDED",
      actorId: "moJRLRc85AitArpNN",
      startedAt: "2024-01-20T10:00:00.000Z",
      finishedAt: "2024-01-20T10:03:30.000Z",
      defaultDatasetId: "wmKPijuyDnPZAPRMk",
      modelVersion: "2026-05-17",
      raw,
    });
  });

  test("normalizes a run with minimal fields", () => {
    const result = normalizeRun({});
    expect(result.id).toBe("");
    expect(result.provider).toBe("apify");
    expect(result.status).toBe("");
    expect(result.actorId).toBe("");
    expect(result.startedAt).toBe("");
    expect(result.finishedAt).toBe("");
    expect(result.defaultDatasetId).toBe("");
  });

  test("uses actId field as actorId", () => {
    const result = normalizeRun({ actId: "actor123", status: "RUNNING" });
    expect(result.actorId).toBe("actor123");
  });

  test("has modelVersion 2026-05-17", () => {
    const result = normalizeRun({});
    expect(result.modelVersion).toBe("2026-05-17");
  });
});

// ---------------------------------------------------------------------------
// parseRunResponse
// ---------------------------------------------------------------------------

describe("parseRunResponse", () => {
  test("parses a wrapped { data: {...} } response", () => {
    const result = parseRunResponse(runNormalizedFixture);
    expect(result.run).not.toBeNull();
    expect(result.run!.id).toBe("HG7ML7M8z78YcAPEB");
    expect(result.run!.status).toBe("SUCCEEDED");
    expect(result.run!.actorId).toBe("moJRLRc85AitArpNN");
    expect(result.run!.defaultDatasetId).toBe("wmKPijuyDnPZAPRMk");
  });

  test("parses an unwrapped run object", () => {
    const runDirect = {
      id: "DIRECT_RUN_ID",
      actId: "actorXYZ",
      status: "RUNNING",
      startedAt: "2024-01-20T10:00:00.000Z",
      finishedAt: "",
      defaultDatasetId: "ds123",
    };
    const result = parseRunResponse(runDirect);
    expect(result.run).not.toBeNull();
    expect(result.run!.id).toBe("DIRECT_RUN_ID");
    expect(result.run!.status).toBe("RUNNING");
  });

  test("returns null for null input", () => {
    const result = parseRunResponse(null);
    expect(result.run).toBeNull();
  });

  test("returns null for non-record input", () => {
    const result = parseRunResponse("string");
    expect(result.run).toBeNull();
  });
});
