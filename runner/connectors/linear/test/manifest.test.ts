import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("linear manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("linear");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("declares api_key setup for the personal API key", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const secretFields = manifest.auth.setup.fields.filter((field: Record<string, unknown>) => field.secret);
    expect(secretFields.map((field: Record<string, unknown>) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.auth.field).toBe("apiKey");
  });

  it("targets the single documented GraphQL host", () => {
    expect(manifest.http.baseUrl).toBe("https://api.linear.app");
    expect(manifest.network.allowedHosts).toEqual(["api.linear.app"]);
  });

  it("declares exactly the 13 operations the brief lists", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "healthcheck",
        "issues.create",
        "issues.update",
        "issues.get",
        "issues.list",
        "issues.search",
        "comments.create",
        "teams.list",
        "workflowStates.list",
        "projects.list",
        "projects.get",
        "users.list",
        "organization.get",
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

  it("posts every operation to /graphql — the only endpoint the provider has", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      expect(String(request.method ?? "GET"), `${key} must POST`).toBe("POST");
      expect(request.path, `${key} must target /graphql`).toBe("/graphql");
    }
  });

  // --- The deliberate departure from the shared template: sideEffect must come
  // from the GraphQL operation type, not the HTTP method, because every Linear
  // call — including every read — is a POST. ---
  it("classifies GraphQL operations by mutation-vs-query, not by HTTP method", () => {
    for (const [key, op] of Object.entries(operations)) {
      const body = (op.request as Record<string, unknown>).body as Record<string, unknown>;
      const query = String(body.query ?? "");
      const expected = query.trimStart().startsWith("mutation") ? "write" : "read";
      expect(op.sideEffect, `${key} is a GraphQL ${expected}`).toBe(expected);
    }
  });

  it("sends the personal API key bare, because Bearer fails Linear auth", () => {
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.auth.value).not.toContain("Bearer");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("Authorization");
  });

  it("treats a 200 carrying errors as a failure", () => {
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["errors"]);
  });

  it("recognises Linear's HTTP 400 rate limit", () => {
    expect(manifest.http.errors.rateLimitCodePaths).toEqual(["errors.0.extensions.code"]);
    expect(manifest.http.errors.rateLimitCodes).toContain("RATELIMITED");
  });

  it("reads the provider's own GraphQL error message", () => {
    expect(manifest.http.errors.messagePaths).toEqual(["errors.0.message"]);
  });

  it("hands the caller a relay cursor on every paginated list", () => {
    const paginated = Object.entries(operations).filter(([, op]) =>
      Object.prototype.hasOwnProperty.call((op.request as Record<string, unknown>).result ?? {}, "nextCursor"),
    );
    expect(paginated.length).toBeGreaterThan(0);
    for (const [key, op] of paginated) {
      expect(
        Object.keys((op.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}),
        `${key} must accept a cursor`,
      ).toContain("after");
    }
  });

  it("requires the only non-null IssueCreateInput field, teamId, plus title in practice", () => {
    const schema = operations["issues.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("teamId");
    expect(schema.required ?? []).toContain("title");
  });

  it("requires id on issues.update and issues.get, and documents the identifier alternative", () => {
    const updateSchema = operations["issues.update"]!.inputSchema as { required?: string[] };
    expect(updateSchema.required ?? []).toContain("id");
    const getSchema = operations["issues.get"]!.inputSchema as { required?: string[] };
    expect(getSchema.required ?? []).toContain("id");
    expect(String(operations["issues.get"]!.description)).toContain("ENG-123");
  });

  it("requires term on issues.search and documents searchIssues over the deprecated issueSearch", () => {
    const schema = operations["issues.search"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("term");
    const body = (operations["issues.search"]!.request as Record<string, unknown>).body as Record<string, unknown>;
    expect(String(body.query)).toContain("searchIssues");
    expect(String(body.query)).not.toContain("issueSearch");
  });

  it("requires issueId and body on comments.create, since a comment needs both to mean anything", () => {
    const schema = operations["comments.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("issueId");
    expect(schema.required ?? []).toContain("body");
  });

  it("does not require anything on the unfiltered list operations", () => {
    for (const key of ["issues.list", "teams.list", "workflowStates.list", "projects.list", "users.list"]) {
      const schema = operations[key]!.inputSchema as { required?: string[] };
      expect(schema.required ?? [], `${key} should not require input`).toEqual([]);
    }
  });

  it("requires id on projects.get", () => {
    const schema = operations["projects.get"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("id");
  });

  it("asserts the healthcheck reads data.viewer.id, not just a 200 status", () => {
    const healthcheck = operations.healthcheck!;
    const result = (healthcheck.request as Record<string, unknown>).result as Record<string, unknown>;
    expect(String(result.viewerId)).toBe("{{response.data.viewer.id}}");
  });

  it("only interpolates body placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify(request.body ?? {}).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
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

  it("does not add the unverified uploads.linear.app host", () => {
    expect(manifest.network.allowedHosts).not.toContain("uploads.linear.app");
    expect(manifest.network.allowedHosts).not.toContain("linear.app");
  });
});
