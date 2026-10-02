import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Ashby manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("ashby");
  });

  it("has version 0.2.0", () => {
    expect(manifest.version).toBe("0.2.0");
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
    expect(manifest.network.allowedHosts).toEqual(["api.ashbyhq.com"]);
  });

  it("uses Basic api_key auth", () => {
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares P0 ops including jobs.list", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "applications.list",
      "candidates.get",
      "candidates.list",
      "healthcheck",
      "jobs.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.list"].kind).toBe("sync");
    expect(manifest.operations["applications.list"].kind).toBe("sync");
    expect(manifest.operations["candidates.get"].kind).toBe("sync");
  });

  it("declares job, candidate, application models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "application"]);
  });
});
