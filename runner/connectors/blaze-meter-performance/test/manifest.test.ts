import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  description?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { additionalProperties?: boolean; type?: string };
  kind?: string;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; success?: number[]; headers?: Record<string, string> };
  responseFormat?: string;
  sideEffect?: string;
  timeoutMs?: number;
  title?: string;
  validationMode?: string;
}>;

// The 27 missing_http backlog rows implemented by this component.
const BACKLOG: Array<[string, string, string, number, string]> = [
  ["folders.list", "GET", "/folders", 200, "read"],
  ["masters.summary", "GET", "/masters/{{masterId}}/reports/default/summary", 200, "read"],
  ["private-locations.create", "POST", "/private-locations", 201, "write"],
  ["private-locations.list", "GET", "/private-locations", 200, "read"],
  ["private-locations.servers.create", "POST", "/private-locations/{{harborId}}/servers", 201, "write"],
  ["projects.create", "POST", "/projects", 201, "write"],
  ["projects.get", "GET", "/projects/{{projectId}}", 200, "read"],
  ["projects.update", "PATCH", "/projects/{{projectId}}", 200, "write"],
  ["search.create", "POST", "/search", 200, "read"],
  ["search.metadata", "GET", "/search/metadata", 200, "read"],
  ["tags.create", "POST", "/workspaces/{{workspaceId}}/tags", 201, "write"],
  ["tests.create", "POST", "/tests", 201, "write"],
  ["tests.duplicate", "GET", "/tests/{{testId}}/duplicate", 201, "write"],
  ["tests.files.delete", "POST", "/tests/{{testId}}/delete-file", 200, "destructive"],
  ["tests.files.list", "GET", "/tests/{{testId}}/files", 200, "read"],
  ["tests.files.upload", "POST", "/tests/{{testId}}/files", 201, "write"],
  ["tests.list", "GET", "/tests", 200, "read"],
  ["tests.update", "PATCH", "/tests/{{testId}}", 200, "write"],
  ["tests.validate", "POST", "/tests/{{testId}}/validate", 200, "write"],
  ["tests.validations.list", "GET", "/tests/{{testId}}/validations", 200, "read"],
  ["user.invites.list", "GET", "/user/invites", 200, "read"],
  ["user.projects.list", "GET", "/user/projects", 200, "read"],
  ["user.register", "POST", "/user/register", 200, "write"],
  ["workspaces.get", "GET", "/workspaces/{{workspaceId}}", 200, "read"],
  ["workspaces.masters.terminate", "POST", "/workspaces/{{workspaceId}}/terminate-masters", 201, "write"],
  ["workspaces.users.list", "GET", "/workspaces/{{workspaceId}}/users", 200, "read"],
  ["workspaces.users.update", "PUT", "/workspaces/{{workspaceId}}/users/{{userId}}", 200, "write"],
];

describe("blaze-meter-performance manifest", () => {
  it("has correct identity and auth", () => {
    expect(manifest.key).toBe("blaze-meter-performance");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.network.allowedHosts).toEqual(["a.blazemeter.com"]);
    expect(manifest.http.baseUrl).toBe("https://a.blazemeter.com/api/v4");
  });

  it("declares the original operations plus the 27-row missing_http backlog", () => {
    const keys = Object.keys(operations).sort();
    expect(keys).toEqual([
      "accounts.list",
      ...BACKLOG.map(([key]) => key),
      "healthcheck",
      "projects.list",
      "tests.get",
      "workspaces.list",
    ].sort());
    expect(keys.length).toBe(32);
  });

  it("implements every backlog row as a strict declarative action", () => {
    for (const [key, method, path, success, sideEffect] of BACKLOG) {
      const operation = operations[key];
      expect(operation, key).toBeTruthy();
      expect(operation.kind, key).toBe("action");
      expect(operation.request?.method, key).toBe(method);
      expect(operation.request?.path, key).toBe(path);
      expect(operation.request?.success, key).toEqual([success]);
      expect(operation.sideEffect, key).toBe(sideEffect);
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(operation.inputSchema?.additionalProperties, key).toBe(false);
      expect(operation.outputSchema?.type, key).toBe("object");
    }
  });

  it("declares bounded budgets and descriptive metadata on every action", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.title!.length, key).toBeGreaterThan(0);
      expect(operation.description!.length, key).toBeGreaterThan(0);
      expect(operation.timeoutMs!, key).toBeGreaterThan(0);
      expect(operation.timeoutMs!, key).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes!, key).toBeGreaterThan(0);
      expect(operation.maxResponseBytes!, key).toBeGreaterThanOrEqual(operation.maxInputBytes!);
      expect(operation.maxResponseBytes!, key).toBeLessThanOrEqual(5242880);
    }
  });

  it("keeps GET reads and marks the asset delete destructive", () => {
    // tests.duplicate is a GET that creates a copy, so it is the one
    // documented GET with a write side effect.
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.request?.method === "GET" && key !== "tests.duplicate") {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
    expect(operations["tests.duplicate"].sideEffect).toBe("write");
    expect(operations["tests.files.delete"].sideEffect).toBe("destructive");
    expect(operations["tests.files.upload"].request?.headers).toMatchObject({
      "Content-Type": "application/octet-stream",
    });
  });
});
