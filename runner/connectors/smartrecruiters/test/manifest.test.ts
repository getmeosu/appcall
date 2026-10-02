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

  it("declares api_key auth with setup fields", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.some((field: { key: string }) => field.key === "apiKey")).toBe(true);
  });

  it("allows expected hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.smartrecruiters.com"]);
  });

  it("uses X-SmartToken header auth", () => {
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-SmartToken",
      value: "{{apiKey}}",
    });
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares job model", () => {
    expect(manifest.models).toContain("job");
  });
});
