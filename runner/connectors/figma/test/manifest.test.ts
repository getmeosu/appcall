import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("figma manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("figma");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("sends the personal access token as the X-Figma-Token header", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("X-Figma-Token");
    expect(manifest.http.auth.value).toBe("{{accessToken}}");
    expect(manifest.http.auth.field).toBe("accessToken");
  });

  it("declares the credential under the field the setup form collects", () => {
    const secretFields = manifest.auth.setup.fields.filter((field: Record<string, unknown>) => field.secret);
    expect(secretFields.map((field: Record<string, unknown>) => field.key)).toEqual(["accessToken"]);
    expect(manifest.http.auth.field).toBe("accessToken");
  });

  it("reads the retry header as a delay in seconds", () => {
    expect(manifest.http.errors.retryAfterHeader).toBe("retry-after");
    expect(manifest.http.errors.retryAfterKind).toBe("seconds");
    expect(manifest.http.errors.defaultRetryAfterSeconds).toBeGreaterThan(0);
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
  });

  it("targets the single documented API host", () => {
    expect(manifest.http.baseUrl).toBe("https://api.figma.com");
    expect(manifest.network.allowedHosts).toEqual(["api.figma.com"]);
  });

  it("declares exactly the 12 operations the brief lists", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "healthcheck",
        "file.get",
        "file.getNodes",
        "file.getMeta",
        "file.listVersions",
        "image.render",
        "image.listFills",
        "comment.list",
        "comment.create",
        "comment.delete",
        "folder.listForTeam",
        "folder.listFiles",
      ].sort(),
    );
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("classifies every mutating operation as a write — a safety control, not metadata", () => {
    const writes = Object.entries(operations)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    expect(writes.length).toBeGreaterThan(0);
    for (const key of writes) {
      expect(operations[key]!.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
    }
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.figma.com");
    }
  });

  it("only interpolates path placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("templates every query and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify([request.query ?? {}, request.body ?? {}]).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!)
        .filter((name) => name.startsWith("input.") === false);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  // --- Connector-specific assertions from the task brief ---

  it("warns callers off the endpoint that is capped at 20 calls a month", () => {
    expect(operations["file.get"]!.description).toMatch(/20 .*month/i);
    expect(operations["file.get"]!.description).toMatch(/getNodes/);
  });

  it("reads both of Figma's two error envelopes", () => {
    expect(manifest.http.errors.messagePaths).toEqual(["err", "message"]);
  });

  it("does not claim a design-write surface Figma's REST API does not have", () => {
    const writes = Object.entries(operations)
      .filter(([, op]) => op.sideEffect === "write")
      .map(([key]) => key);
    expect(writes.sort()).toEqual(["comment.create", "comment.delete"]);
  });

  it("never allowlists the undocumented image CDN", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.figma.com"]);
  });

  it("does not declare bodyErrorPaths, since err:null and error:false are Figma's own success signals", () => {
    expect(manifest.http.errors.bodyErrorPaths).toBeUndefined();
  });

  it("requires ids on file.getNodes and image.render, since both are useless without them", () => {
    const nodesSchema = operations["file.getNodes"]!.inputSchema as { required?: string[] };
    expect(nodesSchema.required ?? []).toContain("ids");
    expect(nodesSchema.required ?? []).toContain("fileKey");

    const imageSchema = operations["image.render"]!.inputSchema as { required?: string[] };
    expect(imageSchema.required ?? []).toContain("ids");
    expect(imageSchema.required ?? []).toContain("fileKey");
  });

  it("requires message on comment.create and fileKey/commentId on comment.delete", () => {
    const createSchema = operations["comment.create"]!.inputSchema as { required?: string[] };
    expect(createSchema.required ?? []).toContain("message");
    expect(createSchema.required ?? []).toContain("fileKey");

    const deleteSchema = operations["comment.delete"]!.inputSchema as { required?: string[] };
    expect(deleteSchema.required ?? []).toContain("fileKey");
    expect(deleteSchema.required ?? []).toContain("commentId");
  });

  it("builds folders only against the v2 folder surface, never the deprecated v1 projects endpoints", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const path = String(request.path ?? "");
      expect(path, `${key} must not call the deprecated projects endpoint`).not.toContain("/projects");
    }
    expect(String((operations["folder.listForTeam"]!.request as Record<string, unknown>).path)).toContain("/v2/");
    expect(String((operations["folder.listFiles"]!.request as Record<string, unknown>).path)).toContain("/v2/");
  });

  it("does not paginate the endpoints that return everything", () => {
    const unpaginated = ["comment.list", "folder.listForTeam", "folder.listFiles", "image.render", "image.listFills"];
    for (const key of unpaginated) {
      const schema = operations[key]!.inputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {}), `${key} must not declare a cursor`).not.toContain("cursor");
    }
  });

  it("paginates file.listVersions with the documented page_size/before/after params", () => {
    const schema = operations["file.listVersions"]!.inputSchema as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toContain("pageSize");
    expect(Object.keys(schema.properties ?? {})).toContain("before");
    expect(Object.keys(schema.properties ?? {})).toContain("after");
  });

  it("documents that comment.create cannot reply to a reply", () => {
    expect(String(operations["comment.create"]!.description)).toMatch(/root comment/i);
  });

  it("documents that image.render returns short-lived CDN links, not bytes, and that null means a failed render", () => {
    const description = String(operations["image.render"]!.description);
    expect(description).toMatch(/short-lived/i);
    expect(description).toMatch(/null/);
  });
});
