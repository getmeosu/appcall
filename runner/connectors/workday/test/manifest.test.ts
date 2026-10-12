import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);
const READ_MUTATING_METHODS = new Set(["wql.query"]);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("workday manifest", () => {
  test("declares a new oauth2 REST connector with tenant host", () => {
    expect(manifest.key).toBe("workday");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["host", "tenant"]);
    expect(manifest.auth.setup.fields.every((field: { required: boolean }) => field.required)).toBe(true);
    expect(manifest.http.baseUrl).toBe("https://{{host}}");
    expect(manifest.network.allowedHosts).toEqual(["{{host}}"]);
    expect(manifest.http.auth).toMatchObject({
      field: "accessToken",
      in: "header",
      name: "Authorization",
      value: "Bearer {{accessToken}}",
    });
    expect(manifest.auth.oauth.authorizeUrl).toBe("https://{{host}}/ccx/oauth2/{{tenant}}/authorize");
    expect(manifest.auth.oauth.tokenUrl).toBe("https://{{host}}/ccx/oauth2/{{tenant}}/token");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers mapped Composio WORKDAY REST tools with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(20);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(COMPOSIO_TOOLS.WORKDAY_GET_CURRENT_USER).toBe("healthcheck");
  });

  test("gives every action a title, description, object inputSchema, and request", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.responseFormat, key).toBe("json");
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(String(request.baseUrl)).toContain("{{host}}");
      expect(String(request.baseUrl)).toContain("{{tenant}}");
      expect(String(request.baseUrl)).toContain("/ccx/api/");
    }
  });

  test("marks mutating REST creates as write and WQL POST as read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String(requestOf(key).method);
      const write = ["POST", "PATCH", "PUT", "DELETE"].includes(method) && !READ_MUTATING_METHODS.has(key);
      if (write) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
    expect(requestOf("wql.query").method).toBe("POST");
    expect(operations["wql.query"]!.sideEffect).toBe("read");
    expect(requestOf("wql.query.get").method).toBe("GET");
    expect(operations["wql.query.get"]!.sideEffect).toBe("read");
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts JSON Content-Type only on bodies and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
        expect(["POST", "PATCH", "PUT"], key).toContain(method);
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented Workday REST collection and item paths", () => {
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/workers/me" });
    expect(requestOf("workers.list").path).toBe("/workers");
    expect(requestOf("workers.get").path).toBe("/workers/{{id}}");
    expect(requestOf("workers.directReports.list").path).toBe("/workers/{{id}}/directReports");
    expect(requestOf("workers.paySlips.get").path).toBe("/workers/{{id}}/paySlips/{{paySlipId}}");
    expect(requestOf("jobPostings.list").path).toBe("/jobPostings");
    expect(requestOf("absenceBalances.list").path).toBe("/balances");
    expect(requestOf("timeOff.requests.create")).toMatchObject({
      method: "POST",
      path: "/workers/{{id}}/requestTimeOff",
    });
    expect(requestOf("wql.query")).toMatchObject({ method: "POST", path: "/data" });
    expect(requestOf("jobChangeFrequencies.list").path).toBe("/values/jobChanges/frequencies");
    expect(String(requestOf("people.list").baseUrl)).toContain("/person/v4/");
    expect(String(requestOf("expenseEntries.list").baseUrl)).toContain("/expense/v1/");
    expect(String(requestOf("timeClockEvents.list").baseUrl)).toContain("/timeTracking/v1/");
    expect(requestOf("workers.jobChanges.create")).toMatchObject({
      method: "POST",
      path: "/workers/{{id}}/jobChanges",
    });
    expect(requestOf("jobChanges.submit")).toMatchObject({ method: "POST", path: "/jobChanges/{{id}}/submit" });
    expect(requestOf("payrollInputs.list").path).toBe("/payrollInputs");
    expect(requestOf("prospects.get").path).toBe("/prospects/{{id}}");
    expect(requestOf("scorecards.list").path).toBe("/scorecards");
    expect(requestOf("wql.query.get")).toMatchObject({ method: "GET", path: "/data" });
    expect(requestOf("expenseEntries.delete")).toMatchObject({ method: "DELETE", path: "/entries/{{id}}" });
    expect(String(requestOf("payrollInputs.list").baseUrl)).toContain("/payroll/v2/");
    expect(String(requestOf("scorecards.list").baseUrl)).toContain("/compensation/v3/");
    expect(String(requestOf("prospects.get").baseUrl)).toContain("/recruiting/v4/");
  });
});
