import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const actionOps = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "action"),
) as Record<string, Record<string, unknown>>;
const webhookOps = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "webhook"),
) as Record<string, Record<string, unknown>>;

describe("asana manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("asana");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("sends the personal access token or OAuth token as a bearer credential, which is what Asana wants for both", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.http.auth.value).toBe("Bearer {{apiToken}}");
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("declares the credential under the field the setup form collects", () => {
    const secretFields = manifest.auth.setup.fields.filter((field: Record<string, unknown>) => field.secret);
    expect(secretFields.map((field: Record<string, unknown>) => field.key)).toEqual(["apiToken"]);
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("reads the retry header as a delay in seconds, which is the shape Asana sends", () => {
    expect(manifest.http.errors.retryAfterHeader).toBe("retry-after");
    expect(manifest.http.errors.retryAfterKind).toBe("seconds");
    expect(manifest.http.errors.defaultRetryAfterSeconds).toBeGreaterThan(0);
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
  });

  it("looks for the provider's own error text at Asana's errors array, falling back to phrase on 5xx", () => {
    expect(manifest.http.errors.messagePaths).toEqual(["errors.0.message", "errors.0.phrase"]);
  });

  it("targets the single documented API host, which covers API, OAuth, and permalinks", () => {
    expect(manifest.http.baseUrl).toBe("https://app.asana.com/api/1.0");
    expect(manifest.network.allowedHosts).toEqual(["app.asana.com"]);
  });

  it("declares the existing surface plus delete, search, project membership, users, tags, attachments, and webhooks", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "attachments.create",
        "healthcheck",
        "projects.create",
        "projects.get",
        "projects.list",
        "sections.addTask",
        "sections.create",
        "sections.list",
        "stories.create",
        "stories.get",
        "stories.listForTask",
        "tags.create",
        "tags.list",
        "tasks.addProject",
        "tasks.create",
        "tasks.delete",
        "tasks.get",
        "tasks.listByProject",
        "tasks.listSubtasks",
        "tasks.removeProject",
        "tasks.search",
        "tasks.update",
        "users.list",
        "users.me",
        "webhook.story.added",
        "webhook.task.added",
        "webhook.task.changed",
        "workspaces.list",
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
      "webhook.story.added",
      "webhook.task.added",
      "webhook.task.changed",
    ]);
    for (const [key, operation] of Object.entries(webhookOps)) {
      expect(operation.kind, key).toBe("webhook");
      expect(operation.request, key).toBeUndefined();
    }
  });

  it("classifies every mutating operation as a write or destructive — a safety control, not metadata", () => {
    const writes = Object.entries(actionOps)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    expect(writes.length).toBeGreaterThan(0);
    for (const key of writes) {
      expect(["write", "destructive"], `${key} mutates`).toContain(actionOps[key]!.sideEffect);
    }
    expect(actionOps["tasks.delete"]!.sideEffect).toBe("destructive");
  });

  it("keeps every request inside the declared outbound host", () => {
    for (const operation of Object.values(actionOps)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("app.asana.com");
    }
  });

  it("only interpolates path placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("templates every query and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
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

  it("wraps every write body in the data envelope Asana requires", () => {
    const writes = Object.entries(actionOps).filter(
      ([, op]) => ["POST", "PUT"].includes(String((op.request as Record<string, unknown>).method)),
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const [key, op] of writes) {
      const body = (op.request as Record<string, unknown>).body as Record<string, unknown>;
      expect(Object.keys(body), `${key} body must be {data: {...}}`).toEqual(["data"]);
    }
  });

  it("reads every id from gid, never from id", () => {
    const mapped = JSON.stringify(Object.values(actionOps).map((op) => (op.request as Record<string, unknown>).result));
    expect(mapped).not.toContain("response.data.id");
  });

  it("hands the caller the opaque offset token on every paginated list", () => {
    const paginated = Object.entries(actionOps).filter(([, op]) =>
      Object.prototype.hasOwnProperty.call((op.request as Record<string, unknown>).result ?? {}, "nextOffset"),
    );
    expect(paginated.length).toBeGreaterThan(0);
    for (const [key, op] of paginated) {
      const schema = op.inputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {}), `${key} must accept an offset`).toContain("offset");
      expect(Object.keys(schema.properties ?? {}), `${key} must send a limit`).toContain("limit");
      expect(((op.request as Record<string, unknown>).result as Record<string, unknown>).nextOffset)
        .toBe("{{response.next_page.offset}}");
    }
  });

  it("requires limit on every operation that maps nextOffset, since the engine drops an unresolved query param rather than erroring", () => {
    // Asana only returns a next_page cursor when limit is supplied — a request without
    // it silently returns an unpaginated result. The engine's only enforcement is
    // inputSchema.required (unresolved templates are dropped, not defaulted), so limit
    // must be required, not merely documented as a property.
    const paginated = Object.entries(actionOps).filter(([, op]) =>
      Object.prototype.hasOwnProperty.call((op.request as Record<string, unknown>).result ?? {}, "nextOffset"),
    );
    expect(paginated.length).toBeGreaterThan(0);
    for (const [key, op] of paginated) {
      const schema = op.inputSchema as { required?: string[] };
      expect(schema.required ?? [], `${key} must require limit, not just accept it`).toContain("limit");
    }
  });

  it("never asks the caller for a limit outside Asana's documented 1-100 range without saying so", () => {
    // limit must be between 1 and 100 per Asana's pagination contract; the engine's
    // validator has no numeric range check, so the constraint must at least be documented.
    const paginated = Object.entries(actionOps).filter(([, op]) =>
      Object.prototype.hasOwnProperty.call((op.request as Record<string, unknown>).result ?? {}, "nextOffset"),
    );
    // Without this guard the loop below passes vacuously if the filter ever
    // matches nothing (e.g. a future refactor renames nextOffset), silently
    // stopping this test from checking anything at all.
    expect(paginated.length).toBeGreaterThan(0);
    for (const [key, op] of paginated) {
      const schema = op.inputSchema as { properties?: Record<string, { description?: string }> };
      const description = schema.properties?.limit?.description ?? "";
      expect(description, `${key} limit must document the 1-100 range`).toMatch(/1.*100|100.*1/);
    }
  });

  it("searches tasks via GET /workspaces/{workspace}/tasks/search and requires workspace", () => {
    const request = operations["tasks.search"]!.request as Record<string, unknown>;
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/workspaces/{{workspace}}/tasks/search");
    const schema = operations["tasks.search"]!.inputSchema as { required?: string[] };
    expect(schema.required ?? []).toContain("workspace");
  });

  it("does not try to read a gid out of sections.addTask's EmptyResponse", () => {
    const request = operations["sections.addTask"]!.request as Record<string, unknown>;
    expect(JSON.stringify(request.result)).not.toContain("response.data.gid");
  });

  it("documents the comment_added filter on the story feed, which also carries system activity", () => {
    expect(String(operations["stories.listForTask"]!.description)).toContain("comment_added");
  });

  it("documents that assignee accepts a gid, an email, or the literal \"me\"", () => {
    const schema = operations["tasks.create"]!.inputSchema as { properties?: Record<string, { description?: string }> };
    expect(schema.properties?.assignee?.description ?? "").toContain("me");
  });
});
