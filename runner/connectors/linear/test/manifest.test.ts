import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const actionOps = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "action"),
) as Record<string, Record<string, unknown>>;
const webhookOps = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "webhook"),
) as Record<string, Record<string, unknown>>;

describe("linear manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("linear");
    expect(manifest.version).toBe("0.2.0");
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

  it("declares the existing surface plus archive, comments, projects write, labels, cycles, attachments, and webhooks", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "attachments.create",
        "comments.create",
        "comments.list",
        "comments.update",
        "cycles.list",
        "healthcheck",
        "issues.archive",
        "issues.create",
        "issues.get",
        "issues.list",
        "issues.search",
        "issues.update",
        "labels.create",
        "labels.list",
        "organization.get",
        "projects.create",
        "projects.get",
        "projects.list",
        "projects.update",
        "teams.get",
        "teams.list",
        "users.get",
        "users.list",
        "webhook.Comment.create",
        "webhook.Issue.create",
        "webhook.Issue.update",
        "workflowStates.list",
      ].sort(),
    );
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("declares webhook ops as kind webhook with no request block", () => {
    expect(Object.keys(webhookOps).sort()).toEqual([
      "webhook.Comment.create",
      "webhook.Issue.create",
      "webhook.Issue.update",
    ]);
    for (const [key, operation] of Object.entries(webhookOps)) {
      expect(operation.kind, key).toBe("webhook");
      expect(operation.request, key).toBeUndefined();
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
    }
  });

  it("posts every action to /graphql — the only endpoint the provider has", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      const request = operation.request as Record<string, unknown>;
      expect(String(request.method ?? "GET"), `${key} must POST`).toBe("POST");
      expect(request.path, `${key} must target /graphql`).toBe("/graphql");
    }
  });

  // --- The deliberate departure from the shared template: sideEffect must come
  // from the GraphQL operation type, not the HTTP method, because every Linear
  // call — including every read — is a POST. ---
  it("classifies GraphQL operations by mutation-vs-query, not by HTTP method", () => {
    for (const [key, op] of Object.entries(actionOps)) {
      const body = (op.request as Record<string, unknown>).body as Record<string, unknown>;
      const query = String(body.query ?? "");
      const isMutation = query.trimStart().startsWith("mutation");
      if (isMutation) {
        expect(["write", "destructive"], `${key} is a GraphQL mutation`).toContain(op.sideEffect);
      } else {
        expect(op.sideEffect, `${key} is a GraphQL query`).toBe("read");
      }
    }
    expect(actionOps["issues.archive"]!.sideEffect).toBe("destructive");
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
    const paginated = Object.entries(actionOps).filter(([, op]) =>
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
    for (const key of ["issues.list", "teams.list", "workflowStates.list", "projects.list", "users.list", "labels.list", "cycles.list"]) {
      const schema = operations[key]!.inputSchema as { required?: string[] };
      expect(schema.required ?? [], `${key} should not require input`).toEqual([]);
    }
  });

  it("requires id on projects.get, teams.get, users.get, and issues.archive", () => {
    for (const key of ["projects.get", "teams.get", "users.get", "issues.archive"]) {
      const schema = operations[key]!.inputSchema as { required?: string[] };
      expect(schema.required ?? [], key).toContain("id");
    }
  });

  it("requires name and teamIds on projects.create", () => {
    const schema = operations["projects.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(["name", "teamIds"]);
  });

  it("requires issueId and url on attachments.create, which is a URL attach not a file upload", () => {
    const schema = operations["attachments.create"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toEqual(["issueId", "url"]);
    const body = (operations["attachments.create"]!.request as Record<string, unknown>).body as Record<string, unknown>;
    expect(String(body.query)).toContain("attachmentCreate");
  });

  it("asserts the healthcheck reads data.viewer.id, not just a 200 status", () => {
    const healthcheck = operations.healthcheck!;
    const result = (healthcheck.request as Record<string, unknown>).result as Record<string, unknown>;
    expect(String(result.viewerId)).toBe("{{response.data.viewer.id}}");
  });

  it("only interpolates body placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
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
