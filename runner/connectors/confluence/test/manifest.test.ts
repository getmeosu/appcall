import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("confluence manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("confluence");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number, key).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number, key).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number, key).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
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

  it("backs off on the documented 429 with a real Retry-After header", () => {
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
    expect(manifest.http.errors.retryAfterHeader).toBe("retry-after");
    expect(manifest.http.errors.retryAfterKind).toBe("seconds");
  });

  it("does not opt into bodyErrorPaths, since errors[] only appears on non-success statuses the status check already catches", () => {
    expect((manifest.http.errors as Record<string, unknown>).bodyErrorPaths).toBeUndefined();
  });

  it("declares exactly the 11 operations the brief lists", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "healthcheck",
        "page.create",
        "page.get",
        "page.update",
        "page.list",
        "page.delete",
        "space.list",
        "space.get",
        "search.cql",
        "attachment.listForPage",
        "comment.create",
      ].sort(),
    );
  });

  it("never declares attachment.upload — multipart bodies are Tier H, not declarative", () => {
    expect(operations["attachment.upload"]).toBeUndefined();
  });

  // --- Connector-specific assertions from the task brief ---

  it("templates the site URL from a REQUIRED setup field", () => {
    expect(manifest.http.baseUrl).toBe("https://{{site}}/wiki");
    // Only the templated entry is declared: buildURL always renders {{site}},
    // so a literal "*.atlassian.net" entry could never be the one that
    // matches — it would only widen what the manifest claims to permit for
    // nothing.
    expect(manifest.network.allowedHosts).toEqual(["{{site}}"]);
    const fields = manifest.auth.setup.fields as { key: string; required?: boolean }[];
    expect(fields.map((f) => f.key)).toEqual(expect.arrayContaining(["site", "email", "apiToken"]));
    expect(fields.find((f) => f.key === "site")?.required).toBe(true);
  });

  it("derives the Basic header rather than asking the operator to encode it", () => {
    expect(manifest.auth.setup.derive).toEqual([
      { field: "basicAuth", kind: "basic", from: ["email", "apiToken"] },
    ]);
    // basicAuth is derived, so it must not be a field the operator is asked for.
    expect(manifest.auth.setup.fields.map((f: { key: string }) => f.key)).not.toContain("basicAuth");
    // auth.field must still name the secret setup field, not the derived one.
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("reads both Confluence error shapes, v2 first", () => {
    expect(manifest.http.errors.messagePaths[0]).toBe("errors.0.detail");
    expect(manifest.http.errors.messagePaths).toContain("message");
  });

  it("uses v2 for content and v1 only where v2 has no endpoint", () => {
    const v1 = Object.entries(operations)
      .filter(([, op]) => String((op.request as Record<string, unknown>).path).startsWith("/rest/api"))
      .map(([key]) => key);
    expect(v1.sort()).toEqual(["healthcheck", "search.cql"]);
  });

  it("requires all five fields page.update needs for optimistic concurrency", () => {
    const schema = operations["page.update"]!.inputSchema as { required?: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["id", "status", "title", "body", "version"]));
  });

  it("requires spaceId (not a space key) on page.create and says so in the description", () => {
    const op = operations["page.create"]!;
    const schema = op.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
    expect(schema.required).toContain("spaceId");
    expect(Object.keys(schema.properties ?? {})).not.toContain("spaceKey");
    expect(String(op.description)).toContain("NOT the space key");
  });

  it("maps _links.next through as an opaque nextLink, never inventing a bare nextCursor", () => {
    for (const key of ["page.list", "space.list", "attachment.listForPage"]) {
      const result = JSON.stringify((operations[key]!.request as Record<string, unknown>).result ?? {});
      expect(result, key).toContain("{{response._links.next}}");
      expect(result, key).not.toContain("nextCursor");
    }
  });
});
