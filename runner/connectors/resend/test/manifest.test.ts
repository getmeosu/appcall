import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("resend manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("resend");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("offers api_key and smtp connection routes", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const routes = manifest.auth.setup.routes;
    const apiRoute = routes.find((r: { id: string }) => r.id === "api_key");
    expect(apiRoute).toBeDefined();
    const apiKeyField = apiRoute.fields.find((f: { key: string }) => f.key === "apiKey");
    expect(apiKeyField.required).toBe(true);
    expect(apiKeyField.secret).toBe(true);
    expect(routes.find((r: { id: string }) => r.id === "smtp")).toBeDefined();
  });

  it("allows resend host", () => {
    expect(manifest.network.allowedHosts).toContain("api.resend.com");
  });

  it("has the expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("emails.send");
    expect(ops).toContain("healthcheck");
    expect(ops.length).toBe(2);
  });

  it("operations are all actions", () => {
    expect(manifest.operations["emails.send"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  it("emails.send requires from/to/subject", () => {
    expect(manifest.operations["emails.send"].inputSchema.required).toEqual(["from", "to", "subject"]);
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["email"]);
  });

  it("operations have timeout constraints", () => {
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
    expect(manifest.operations["emails.send"].timeoutMs).toBe(15000);
  });
});
