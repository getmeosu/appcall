import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const compiled = compileDeclarativeConnector(manifest as never);
const fixturesDir = join(import.meta.dir, "../fixtures/cases");

const CORE = [
  "companies.get",
  "companies.create",
  "companies.update",
  "companies.delete",
  "companies.search",
  "contacts.get",
  "contacts.create",
  "contacts.update",
  "contacts.delete",
  "contacts.search",
  "deals.get",
  "deals.create",
  "deals.update",
  "deals.delete",
  "deals.search",
  "tickets.get",
  "tickets.create",
  "tickets.update",
  "tickets.search",
  "engagements.calls.create",
  "engagements.meetings.create",
  "engagements.notes.create",
  "engagements.tasks.create",
  "owners.list",
  "pipelines.deals.list",
  "associations.create",
  "healthcheck",
  "list.all.engagements",
  "crm-object-schemas.schemas.associations.create",
] as const;

function sample(prop: Record<string, any> | undefined): unknown {
  if (!prop) return "x";
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0];
  if (prop.type === "integer" || prop.type === "number") return typeof prop.minimum === "number" ? prop.minimum : 1;
  if (prop.type === "boolean") return true;
  if (prop.type === "array") {
    const count = Math.max(prop.minItems ?? 1, 1);
    return Array.from({ length: count }, () => sample(prop.items ?? { type: "string" }));
  }
  if (prop.type === "object") {
    const properties = prop.properties ?? {};
    const required = Array.isArray(prop.required) ? prop.required : [];
    const output: Record<string, unknown> = {};
    for (const key of required) output[key] = sample(properties[key]);
    return output;
  }
  const min = typeof prop.minLength === "number" ? prop.minLength : 1;
  return "x".repeat(Math.max(min, 1));
}

function dummyInput(operation: Record<string, any>): Record<string, unknown> {
  const schema = operation.inputSchema ?? { type: "object", properties: {} };
  const properties = schema.properties ?? {};
  const path = String(operation.request?.path ?? "");
  const placeholders = [...path.matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]!);
  const keys = new Set<string>([...(schema.required ?? []), ...placeholders]);
  const input: Record<string, unknown> = {};
  for (const key of keys) input[key] = sample(properties[key]);
  return input;
}

async function invoke(key: string, input: Record<string, unknown>, status: number, payload: unknown) {
  const requests: Request[] = [];
  const result = await compiled.actions[key]!({
    accessToken: "dummy-token",
    ...input,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(url, init);
      requests.push(request);
      const empty = payload === null;
      return new Response(empty ? null : JSON.stringify(payload), {
        status,
        headers: empty ? undefined : { "content-type": "application/json" },
      });
    },
  });
  return { requests, result };
}

describe("hubspot core requests", () => {
  test("every non-webhook operation declares a method and path", () => {
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(297);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
        expect(operation.request, key).toBeUndefined();
        continue;
      }
      expect(operation.request?.method, key).toBeTypeOf("string");
      expect(String(operation.request.path).startsWith("/"), key).toBe(true);
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body, key).toBeUndefined();
      }
    }
  });

  test("sync lists declare the CRM list endpoint but stay uncompiled", () => {
    for (const [key, objectType] of [
      ["contacts.list", "contacts"],
      ["companies.list", "companies"],
      ["deals.list", "deals"],
      ["tickets.list", "tickets"],
    ] as const) {
      expect(operations[key]!.kind).toBe("sync");
      expect(operations[key]!.request.method).toBe("GET");
      expect(operations[key]!.request.path).toBe(`/crm/objects/2026-09/${objectType}`);
      expect(compiled.actions[key]).toBeUndefined();
      expect(compiled.syncs[key]).toBeUndefined();
    }
  });

  test("core actions call api.hubapi.com", async () => {
    for (const key of CORE) {
      const operation = operations[key]!;
      const status = operation.request.success[0] as number;
      const payload = status === 204 ? null : { id: "x" };
      const { requests, result } = await invoke(key, dummyInput(operation), status, payload);
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(operation.request.method);
      const url = new URL(requests[0]!.url);
      expect(url.protocol, key).toBe("https:");
      expect(url.hostname, key).toBe("api.hubapi.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy-token");
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(await requests[0]!.clone().text(), key).toBe("");
      }
      expect(result, key).toMatchObject({ connector: "hubspot", action: key, source: "provider" });
    }
  });

  test("maps friendly CRM fields onto HubSpot property names", async () => {
    const contact = await invoke(
      "contacts.create",
      { email: "a@b.com", firstName: "Ada", lastName: "Lovelace" },
      201,
      { id: "1" },
    );
    expect(new URL(contact.requests[0]!.url).pathname).toBe("/crm/objects/2026-09/contacts");
    expect(JSON.parse(await contact.requests[0]!.clone().text())).toEqual({
      properties: { email: "a@b.com", firstname: "Ada", lastname: "Lovelace" },
    });

    const deal = await invoke(
      "deals.create",
      { name: "Pilot", amount: "15", stage: "contractsent", pipeline: "default" },
      201,
      { id: "2" },
    );
    expect(JSON.parse(await deal.requests[0]!.clone().text())).toEqual({
      properties: { dealname: "Pilot", amount: "15", dealstage: "contractsent", pipeline: "default" },
    });

    const note = await invoke("engagements.notes.create", { body: "hello", timestamp: "1710000000000" }, 201, { id: "3" });
    expect(JSON.parse(await note.requests[0]!.clone().text())).toEqual({
      properties: { hs_note_body: "hello", hs_timestamp: "1710000000000" },
    });

    const link = await invoke(
      "associations.create",
      {
        fromObjectType: "contacts",
        fromId: "9",
        toObjectType: "companies",
        toId: "4",
        associationTypeId: 1,
        associationCategory: "HUBSPOT_DEFINED",
      },
      200,
      { id: "4" },
    );
    expect(new URL(link.requests[0]!.url).pathname).toBe("/crm/objects/2026-09/contacts/9/associations/companies/4");
    expect(JSON.parse(await link.requests[0]!.clone().text())).toEqual([
      { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 },
    ]);

    const owners = await invoke("owners.list", { email: "a@b.com", limit: 10 }, 200, { results: [] });
    const ownersUrl = new URL(owners.requests[0]!.url);
    expect(ownersUrl.pathname).toBe("/crm/owners/2026-09");
    expect(ownersUrl.searchParams.get("email")).toBe("a@b.com");
    expect(ownersUrl.searchParams.get("limit")).toBe("10");

    const pipelines = await invoke("pipelines.deals.list", {}, 200, { results: [] });
    expect(new URL(pipelines.requests[0]!.url).pathname).toBe("/crm/pipelines/2026-09/deals");

    const health = await invoke("healthcheck", {}, 200, { portalId: 1 });
    expect(new URL(health.requests[0]!.url).pathname).toBe("/account-info/v3/details");
    expect(await health.requests[0]!.clone().text()).toBe("");

    const page = await invoke("list.all.engagements", { limit: 50, offset: 0 }, 200, { results: [] });
    const pageUrl = new URL(page.requests[0]!.url);
    expect(pageUrl.pathname).toBe("/engagements/v1/engagements/paged");
    expect(pageUrl.searchParams.get("limit")).toBe("50");
    expect(pageUrl.searchParams.get("offset")).toBe("0");

    const definition = await invoke(
      "crm-object-schemas.schemas.associations.create",
      { objectType: "2-1", fromObjectTypeId: "2-1", toObjectTypeId: "0-1", name: "pet" },
      201,
      { id: "pet" },
    );
    expect(new URL(definition.requests[0]!.url).pathname).toBe("/crm-object-schemas/2026-09/schemas/2-1/associations");
    expect(JSON.parse(await definition.requests[0]!.clone().text())).toEqual({
      fromObjectTypeId: "2-1",
      toObjectTypeId: "0-1",
      name: "pet",
    });
  });

  test("every action dispatches and every non-webhook op has a success fixture", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      const id = `${key.replaceAll(".", "-")}-success`;
      const caseFile = JSON.parse(readFileSync(join(fixturesDir, `${id}.json`), "utf8"));
      expect(caseFile.operation, key).toBe(key);
      expect(caseFile.exchanges[0].request.method, key).toBe(operation.request.method);
      const body = caseFile.exchanges[0].request.body;
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(body, key).toBeNull();
      } else {
        expect(typeof body, key).toBe("string");
        expect(body, key).toBe(JSON.stringify(JSON.parse(body)));
      }
      if (operation.kind !== "action") continue;
      const status = operation.request.success[0] as number;
      const payload = status === 204 ? null : { id: "x" };
      const { requests } = await invoke(key, dummyInput(operation), status, payload);
      expect(requests, key).toHaveLength(1);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.hubapi.com");
    }
    expect(readdirSync(fixturesDir).filter((name) => name.endsWith(".json")).length).toBeGreaterThanOrEqual(293);
  });
});
