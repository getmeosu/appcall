import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";
import composioMappings from "../fixtures/composio_tool_mapping.json";

describe("resend manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("resend");
    expect(manifest.version).toBe("0.4.2");
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
    expect(ops).toContain("emails.get");
    expect(ops).toContain("emails.list");
    expect(ops).toContain("domains.list");
    expect(ops).toContain("domains.get");
    expect(ops).toContain("contacts.list");
    expect(ops).toContain("contacts.retrieve");
    expect(ops).toContain("healthcheck");
    expect(ops).not.toContain("broadcasts.update_draft");
    expect(ops.length).toBe(67);
  });

  it("reconciles all current Composio tool mappings exactly once", () => {
    const mappings = composioMappings as Array<{
      tool: string;
      operation: string | null;
      status: "mapped" | "partial" | "missing";
      note?: string;
    }>;
    const names = mappings.map(({ tool }) => tool);
    expect(mappings).toHaveLength(66);
    expect(new Set(names).size).toBe(66);
    for (const mapping of mappings) {
      if (mapping.operation !== null) {
        expect(manifest.operations[mapping.operation as keyof typeof manifest.operations]).toBeDefined();
      }
    }

    const byStatus = Object.fromEntries(["mapped", "partial", "missing"].map((status) => [
      status,
      mappings.filter((mapping) => mapping.status === status).length,
    ]));
    expect(byStatus).toEqual({ mapped: 61, partial: 5, missing: 0 });
    expect(mappings.find(({ tool }) => tool === "RESEND_UPDATE_DRAFT_BROADCAST")).toMatchObject({
      operation: "broadcasts.update",
      status: "partial",
    });
    expect(mappings.find(({ tool }) => tool === "RESEND_CREATE_TEMPLATE")).toEqual({
      tool: "RESEND_CREATE_TEMPLATE",
      operation: "templates.create",
      status: "mapped",
    });
    expect(mappings.find(({ tool }) => tool === "RESEND_UPDATE_TEMPLATE")).toMatchObject({
      operation: "templates.update",
      status: "partial",
      note: expect.stringMatching(/boolean update variables are rejected before HTTP/i),
    });
  });

  it("operations are all actions", () => {
    expect(manifest.operations["emails.send"].kind).toBe("action");
    expect(manifest.operations["emails.get"].kind).toBe("action");
    expect(manifest.operations["emails.list"].kind).toBe("action");
    expect(manifest.operations["domains.list"].kind).toBe("action");
    expect(manifest.operations["domains.get"].kind).toBe("action");
    expect(manifest.operations["contacts.list"].kind).toBe("action");
    expect(manifest.operations["contacts.retrieve"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  it("emails.send requires from/to/subject", () => {
    expect(manifest.operations["emails.send"].inputSchema.required).toEqual(["from", "to", "subject"]);
  });

  it("emails.get requires id", () => {
    expect(manifest.operations["emails.get"].inputSchema.required).toEqual(["id"]);
  });

  it("domains.get requires id", () => {
    expect(manifest.operations["domains.get"].inputSchema.required).toEqual(["id"]);
  });

  it("read ops use sideEffect read", () => {
    expect(manifest.operations["domains.get"].sideEffect).toBe("read");
    expect(manifest.operations["contacts.list"].sideEffect).toBe("read");
    expect(manifest.operations["contacts.retrieve"].sideEffect).toBe("read");
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual(["email", "domain", "contact"]);
  });

  it("operations have timeout constraints", () => {
    expect(manifest.operations["healthcheck"].timeoutMs).toBe(5000);
    expect(manifest.operations["emails.send"].timeoutMs).toBe(15000);
    expect(manifest.operations["emails.get"].timeoutMs).toBe(15000);
    expect(manifest.operations["emails.list"].timeoutMs).toBe(15000);
    expect(manifest.operations["domains.list"].timeoutMs).toBe(15000);
    expect(manifest.operations["domains.get"].timeoutMs).toBe(15000);
    expect(manifest.operations["contacts.list"].timeoutMs).toBe(15000);
  });
});
