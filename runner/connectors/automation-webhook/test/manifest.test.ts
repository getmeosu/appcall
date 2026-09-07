import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("automation-webhook manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("automation-webhook");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses no auth", () => {
    expect(manifest.auth.type).toBe("none");
  });

  it("declares no allowed hosts, so all outbound egress is denied", () => {
    expect(manifest.network.allowedHosts).toEqual([]);
  });

  it("has healthcheck operation", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("healthcheck");
  });

  it("healthcheck is an action with correct constraints", () => {
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
    expect(manifest.operations["healthcheck"].maxInputBytes).toBe(4096);
    expect(manifest.operations["healthcheck"].maxResponseBytes).toBe(65536);
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["event"]);
  });
});
