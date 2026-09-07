import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Workable manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("workable");
  });

  it("has version 0.1.0", () => {
    expect(manifest.version).toBe("0.1.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires bearer auth", () => {
    expect(manifest.auth.type).toBe("bearer");
  });

  it("allows only workable host", () => {
    expect(manifest.network.allowedHosts).toEqual(["www.workable.com"]);
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
