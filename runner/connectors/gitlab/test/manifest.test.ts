import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("gitlab manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("gitlab");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("declares api_key setup with apiToken as the secret field http.auth.field points at", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    const apiTokenField = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "apiToken")!;
    expect(apiTokenField.secret).toBe(true);
    expect(apiTokenField.required).toBe(true);
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("uses Authorization: Bearer, which is the one header form covering both a PAT and an OAuth token", () => {
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiToken}}");
  });

  it("declares exactly the 16 operations the brief lists", () => {
    expect(Object.keys(operations).sort()).toEqual(
      [
        "healthcheck",
        "issues.create",
        "issues.update",
        "issues.get",
        "issues.list",
        "issues.comment",
        "mergeRequests.create",
        "mergeRequests.update",
        "mergeRequests.get",
        "mergeRequests.list",
        "mergeRequests.merge",
        "pipelines.create",
        "pipelines.get",
        "pipelines.list",
        "projects.list",
        "projects.get",
      ].sort(),
    );
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

  it("reads the provider's own error text from message, falling back to error for OAuth endpoints", () => {
    expect(manifest.http.errors.messagePaths).toEqual(["message", "error"]);
  });

  it("backs off on the documented 429 with a real Retry-After header", () => {
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
    expect(manifest.http.errors.retryAfterHeader).toBe("retry-after");
    expect(manifest.http.errors.retryAfterKind).toBe("seconds");
  });

  // --- Connector-specific assertions from the task brief ---

  it("templates the base URL from a REQUIRED setup field, which is what makes it safe", () => {
    expect(manifest.http.baseUrl).toBe("https://{{host}}/api/v4");
    // Only the templated entry is declared: buildURL always renders {{host}},
    // so a literal "gitlab.com" entry could never be the one that matches —
    // it would only widen what the manifest claims to permit for nothing.
    // The self-hosted vs. SaaS distinction is entirely in what {{host}}
    // resolves to at request time, not in a second allowlist entry.
    expect(manifest.network.allowedHosts).toEqual(["{{host}}"]);
    // Required is the load-bearing half: a blank optional field never enters the
    // credential bundle, which would leave the host caller-controlled.
    const host = manifest.auth.setup.fields.find((f: { key: string }) => f.key === "host");
    expect(host).toBeDefined();
    expect(host.required).toBe(true);
    expect(host.secret).not.toBe(true);
  });

  it("uses the singular pipeline path on create and the plural one on read", () => {
    expect((operations["pipelines.create"]!.request as Record<string, unknown>).path)
      .toBe("/projects/{{projectId}}/pipeline");
    expect((operations["pipelines.list"]!.request as Record<string, unknown>).path)
      .toBe("/projects/{{projectId}}/pipelines");
    expect((operations["pipelines.get"]!.request as Record<string, unknown>).path)
      .toBe("/projects/{{projectId}}/pipelines/{{pipelineId}}");
  });

  it("takes the project-scoped iid in every path that has one", () => {
    for (const [key, op] of Object.entries(operations)) {
      const path = String((op.request as Record<string, unknown>).path ?? "");
      if (path.includes("/issues/")) expect(path, key).toContain("{{issueIid}}");
      if (path.includes("/merge_requests/")) expect(path, key).toContain("{{mergeRequestIid}}");
    }
  });

  it("names the issue and merge request path inputs iid, not id, so an agent cannot pass the wrong one", () => {
    for (const key of ["issues.update", "issues.get", "issues.comment"]) {
      const schema = operations[key]!.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      expect(Object.keys(schema.properties ?? {}), key).toContain("issueIid");
      expect(Object.keys(schema.properties ?? {}), key).not.toContain("issueId");
      expect(schema.required ?? [], key).toContain("issueIid");
    }
    for (const key of ["mergeRequests.update", "mergeRequests.get", "mergeRequests.merge"]) {
      const schema = operations[key]!.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      expect(Object.keys(schema.properties ?? {}), key).toContain("mergeRequestIid");
      expect(Object.keys(schema.properties ?? {}), key).not.toContain("mergeRequestId");
      expect(schema.required ?? [], key).toContain("mergeRequestIid");
    }
  });

  it("uses auto_merge rather than the deprecated merge_when_pipeline_succeeds", () => {
    const body = JSON.stringify((operations["mergeRequests.merge"]!.request as Record<string, unknown>).body ?? {});
    expect(body).toContain("auto_merge");
    expect(body).not.toContain("merge_when_pipeline_succeeds");
  });

  it("maps the next offset page from the x-next-page response header on every list operation", () => {
    for (const key of ["issues.list", "mergeRequests.list", "pipelines.list", "projects.list"]) {
      const result = JSON.stringify((operations[key]!.request as Record<string, unknown>).result ?? {});
      expect(result, key).toContain("{{headers.x-next-page}}");
    }
  });

  it("does not fabricate a note URL, since a note carries no web_url field", () => {
    const result = (operations["issues.comment"]!.request as Record<string, unknown>).result as Record<string, unknown>;
    expect(JSON.stringify(result)).not.toContain("web_url");
  });

  it("requires projectId on every project-scoped operation", () => {
    for (const [key, op] of Object.entries(operations)) {
      const path = String((op.request as Record<string, unknown>).path ?? "");
      if (!path.startsWith("/projects/{{projectId}}")) continue;
      const schema = op.inputSchema as { required?: string[] };
      expect(schema.required ?? [], key).toContain("projectId");
    }
  });
});
