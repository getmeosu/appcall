import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("webhook manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("webhook");
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
    expect(manifest.operations).toHaveProperty("healthcheck");
    expect((manifest.operations as any).healthcheck.kind).toBe("action");
    expect((manifest.operations as any).healthcheck.timeoutMs).toBe(5000);
  });

  it("has event model", () => {
    expect(manifest.models).toEqual(["event"]);
  });
});
