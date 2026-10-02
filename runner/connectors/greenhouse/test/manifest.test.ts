import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Greenhouse manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("greenhouse");
  });

  it("has version 0.3.0", () => {
    expect(manifest.version).toBe("0.3.0");
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
    expect(manifest.network.allowedHosts).toEqual(["harvest.greenhouse.io", "boards-api.greenhouse.io"]);
  });

  it("uses Harvest Basic auth and keeps boards host", () => {
    expect(manifest.http.baseUrl).toBe("https://harvest.greenhouse.io/v1");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
    expect(manifest.network.allowedHosts).toContain("boards-api.greenhouse.io");
  });

  it("declares P0 list + P1 get/interview ops", () => {
    expect(manifest.operations["candidates.list"]).toBeTruthy();
    expect(manifest.operations["candidates.get"]).toBeTruthy();
    expect(manifest.operations["applications.list"]).toBeTruthy();
    expect(manifest.operations["users.list"]).toBeTruthy();
    expect(manifest.operations["jobs.list"]).toBeTruthy();
    expect(manifest.operations["jobs.get"]).toBeTruthy();
    expect(manifest.operations["interviews.list"]).toBeTruthy();
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares job/candidate/application/user/interview models", () => {
    expect(manifest.models).toEqual(["job", "candidate", "application", "user", "interview"]);
  });
});
