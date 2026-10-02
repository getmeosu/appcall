import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Lever manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("lever");
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
    expect(manifest.network.allowedHosts).toEqual(["api.lever.co", "api.lever.eu"]);
  });

  it("requires region for US/EU host selection", () => {
    expect(manifest.auth.setup.fields.some((field: { key: string }) => field.key === "region")).toBe(true);
    expect(manifest.http.baseUrl).toContain("{{region}}");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
  });

  it("declares authenticated healthcheck request", () => {
    expect(manifest.operations.healthcheck.request).toBeTruthy();
    expect(manifest.operations.healthcheck.kind).toBe("action");
  });

  it("declares P0 list ops plus P1 get/interviews/feedback", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "healthcheck",
      "jobs.list",
      "opportunities.feedback.list",
      "opportunities.get",
      "opportunities.interviews.list",
      "opportunities.list",
      "stages.list",
      "users.list",
    ]);
    expect(manifest.operations["jobs.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.get"].kind).toBe("sync");
    expect(manifest.operations["opportunities.interviews.list"].kind).toBe("sync");
    expect(manifest.operations["opportunities.feedback.list"].kind).toBe("sync");
    expect(manifest.operations["stages.list"].kind).toBe("sync");
    expect(manifest.operations["users.list"].kind).toBe("sync");
  });

  it("declares job, opportunity, stage, user, interview, feedback models", () => {
    expect(manifest.models).toEqual([
      "job",
      "opportunity",
      "stage",
      "user",
      "interview",
      "feedback",
    ]);
  });
});
