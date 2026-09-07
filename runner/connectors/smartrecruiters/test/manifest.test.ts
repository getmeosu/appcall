import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("SmartRecruiters manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("smartrecruiters");
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

  it("allows only smartrecruiters host", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "api.smartrecruiters.com",
    ]);
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
