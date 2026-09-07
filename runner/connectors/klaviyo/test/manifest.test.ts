import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("klaviyo manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("klaviyo");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses api_key auth with a secret apiKey field", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const apiKeyField = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "apiKey");
    expect(apiKeyField).toBeDefined();
    expect(apiKeyField.required).toBe(true);
    expect(apiKeyField.secret).toBe(true);
  });

  it("allows klaviyo hosts", () => {
    expect(manifest.network.allowedHosts).toContain("a.klaviyo.com");
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("contacts.list");
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("lists.list");
    expect(ops).toContain("contacts.create");
    expect(ops).toContain("healthcheck");
    // new actions
    expect(ops).toContain("profiles.get");
    expect(ops).toContain("profiles.update");
    expect(ops).toContain("lists.create");
    expect(ops).toContain("lists.get");
    expect(ops).toContain("profiles.addToList");
    expect(ops).toContain("profiles.removeFromList");
    expect(ops).toContain("events.create");
    expect(ops).toContain("segments.get");
    expect(ops).toContain("campaigns.create");
  });

  it("has correct models", () => {
    expect(manifest.models).toContain("contact");
    expect(manifest.models).toContain("campaign");
    expect(manifest.models).toContain("list");
    expect(manifest.models).toContain("profile");
    expect(manifest.models).toContain("event");
    expect(manifest.models).toContain("segment");
  });

  it("has sync operations with correct kinds", () => {
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["lists.list"].kind).toBe("sync");
  });

  it("has action operations with correct kinds", () => {
    expect(manifest.operations["contacts.create"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(manifest.operations["profiles.get"].kind).toBe("action");
    expect(manifest.operations["profiles.update"].kind).toBe("action");
    expect(manifest.operations["lists.create"].kind).toBe("action");
    expect(manifest.operations["lists.get"].kind).toBe("action");
    expect(manifest.operations["profiles.addToList"].kind).toBe("action");
    expect(manifest.operations["profiles.removeFromList"].kind).toBe("action");
    expect(manifest.operations["events.create"].kind).toBe("action");
    expect(manifest.operations["segments.get"].kind).toBe("action");
    expect(manifest.operations["campaigns.create"].kind).toBe("action");
  });

  it("all new actions have title, description, and object inputSchema", () => {
    const newOps = ["profiles.get", "profiles.update", "lists.create", "lists.get",
      "profiles.addToList", "profiles.removeFromList", "events.create", "segments.get", "campaigns.create"];
    for (const op of newOps) {
      const operation = (manifest.operations as any)[op];
      expect(operation.title).toBeTruthy();
      expect(operation.description).toBeTruthy();
      expect(operation.inputSchema.type).toBe("object");
      expect(operation.timeoutMs).toBeGreaterThan(0);
      expect(operation.maxInputBytes).toBeGreaterThan(0);
      expect(operation.maxResponseBytes).toBeGreaterThan(0);
    }
  });

  it("has timeout constraints on operations", () => {
    expect(manifest.operations["contacts.list"].timeoutMs).toBe(30000);
    expect(manifest.operations["campaigns.list"].timeoutMs).toBe(15000);
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
  });
});
