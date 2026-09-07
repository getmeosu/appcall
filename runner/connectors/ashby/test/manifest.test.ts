import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Ashby manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("ashby");
  });

  it("has version 0.1.0", () => {
    expect(manifest.version).toBe("0.1.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("has no auth (public API)", () => {
    expect(manifest.auth.type).toBe("none");
  });

  it("allows only ashby host", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.ashbyhq.com"]);
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
