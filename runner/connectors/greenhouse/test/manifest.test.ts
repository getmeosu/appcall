import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Greenhouse manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("greenhouse");
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

  it("allows only greenhouse hosts", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "boards-api.greenhouse.io",
    ]);
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
