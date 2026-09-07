import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Zoho Recruit manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("zoho-recruit");
  });

  it("has version 0.1.0", () => {
    expect(manifest.version).toBe("0.1.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("requires oauth2 auth", () => {
    expect(manifest.auth.type).toBe("oauth2");
  });

  it("allows only recruit.zoho.com", () => {
    expect(manifest.network.allowedHosts).toEqual(["recruit.zoho.com"]);
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
