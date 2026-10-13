import { expect, it } from "bun:test";
import manifest from "../manifest.json";

const originKeys = [
  "healthcheck",
  "surveys.list",
  "surveys.get",
  "surveys.email",
  "questions.list",
  "questions.get",
  "responses.search",
  "responses.get",
  "responses.create",
  "responses.update",
  "answers.search",
  "answers.get",
  "answers.update",
  "customers.list",
  "customers.get",
  "customers.create",
  "customers.update",
  "customers.bulkUpsert",
  "teamMembers.get",
  "teamMembers.create",
];

it("keeps origin Simplesat auth and host and adds the two JSON routes", () => {
  expect(manifest.version).toBe("0.2.1");
  expect("full_depth" in manifest).toBe(false);
  expect(manifest.http.baseUrl).toBe("https://api.simplesat.io");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "X-Simplesat-Token",
    value: "{{apiKey}}",
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(manifest.network.allowedHosts).toEqual(["api.simplesat.io"]);
  const ops = manifest.operations as Record<string, any>;
  expect(Array.isArray(manifest.operations)).toBe(false);
  expect(Object.keys(ops)).toEqual([
    ...originKeys,
    "SIMPLESAT_LIST_ANSWERS",
    "SIMPLESAT_UPDATE_CUSTOMER",
  ]);

  const patch = ops["customers.update"];
  expect(patch.request.method).toBe("PATCH");
  expect(patch.request.path).toBe("/api/v1/customers/{{customerId}}");
  expect(patch.request.headers).toEqual({ "Content-Type": "application/json" });

  const list = ops.SIMPLESAT_LIST_ANSWERS;
  expect(list.request).toEqual({
    method: "GET",
    path: "/api/answers/",
    query: {
      page: "{{page}}",
      page_size: "{{page_size}}",
      modified__gte: "{{modified__gte}}",
      modified__lte: "{{modified__lte}}",
    },
    success: [200],
  });
  expect(list.request.body).toBeUndefined();
  expect(list.request.headers).toBeUndefined();
  expect(list.sideEffect).toBe("read");
  expect(list.outputSchema.type).toBe("object");
  expect(list.outputSchema.properties.data.type).toBe("object");

  const put = ops.SIMPLESAT_UPDATE_CUSTOMER;
  expect(put.request.method).toBe("PUT");
  expect(put.request.path).toBe("/api/v1/customers/{{customer_id}}");
  expect(put.request.headers).toEqual({ "Content-Type": "application/json" });
  expect(put.request.body).toEqual({
    external_id: "{{external_id}}",
    name: "{{name}}",
    company: "{{company}}",
    language: "{{language}}",
    tags: "{{tags}}",
    custom_attributes: "{{custom_attributes}}",
  });
  expect(put.sideEffect).toBe("write");
  expect(put.outputSchema.type).toBe("object");
  expect(put.outputSchema.properties.data.type).toBe("object");

  const paths = Object.values(ops).map((op) => op.request.path);
  expect(paths.filter((path) => path === "/api/answers/")).toEqual(["/api/answers/"]);
  expect(paths.includes("/api/answers")).toBe(false);
  expect(paths.filter((path) => path === "/api/v1/customers/{{customer_id}}")).toEqual([
    "/api/v1/customers/{{customer_id}}",
  ]);

  for (const [key, op] of Object.entries(ops)) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
    expect(op.timeoutMs).toBeGreaterThanOrEqual(1);
    expect(op.timeoutMs).toBeLessThanOrEqual(300000);
    expect(op.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    expect(String(op.request.path).startsWith("http://")).toBe(false);
    expect(String(op.request.path).includes("{") && !String(op.request.path).includes("{{")).toBe(false);
    const method = op.request.method;
    if (method === "GET" || method === "DELETE") {
      expect(op.request.body).toBeUndefined();
      expect(op.request.headers?.["Content-Type"]).toBeUndefined();
    }
    if (op.request.body !== undefined) {
      expect(op.request.headers["Content-Type"]).toBe("application/json");
    }
    if (key === "SIMPLESAT_LIST_ANSWERS") {
      expect(op.sideEffect).toBe("read");
    } else if (key === "SIMPLESAT_UPDATE_CUSTOMER") {
      expect(op.sideEffect).toBe("write");
    } else {
      expect(op.sideEffect).toBe(
        /^$/.test(key) ? "destructive" : /create|update|bulk|email/.test(key) ? "write" : "read",
      );
    }
  }
});
