import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = [
  "healthcheck",
  "stats.get",
  "people.linkedin.personal-email-status",
  "people.linkedin.work-email-status",
  "people.linkedin.phone-status",
] as const;

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      const min = typeof prop.minItems === "number" ? prop.minItems : 1;
      let sample: unknown;
      if (items.type === "integer" || items.type === "number") sample = 1;
      else if (items.type === "object") sample = dummyInput(items);
      else sample = key.includes("url") || key === "profiles" ? "https://www.linkedin.com/in/example-person" : "x";
      input[key] = Array.from({ length: Math.max(min, 1) }, () => sample);
    } else if (prop.type === "object") input[key] = dummyInput(prop);
    else input[key] = key.includes("url") || key === "profile" ? "https://www.linkedin.com/in/example-person" : "x";
  }
  return input;
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("contactout manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("contactout");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["api.contactout.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.contactout.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("token");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", authorization: "basic" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).method, key).toBe("GET");
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/stats" });
    expect(requestOf("stats.get").path).toBe("/v1/stats");
    expect(requestOf("people.linkedin.personal-email-status").path).toBe("/v1/people/linkedin/personal_email_status");
    expect(requestOf("people.linkedin.work-email-status").path).toBe("/v1/people/linkedin/work_email_status");
    expect(requestOf("people.linkedin.phone-status").path).toBe("/v1/people/linkedin/phone_status");
    expect((operations["people.linkedin.personal-email-status"]!.inputSchema as { required: string[] }).required).toEqual(["profile"]);
  });

  test("covers every Composio ContactOut tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(25);
    expect(Object.keys(operations).length).toBe(29);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v1/") || String(request.path).startsWith("/v2/"), key).toBe(true);
    }
  });

  test("classifies mutating campaign methods as write or destructive", () => {
    expect(operations["campaigns.recipients.add"]!.sideEffect).toBe("write");
    expect(operations["campaigns.start"]!.sideEffect).toBe("write");
    expect(operations["campaigns.stop"]!.sideEffect).toBe("write");
    expect(operations["campaigns.recipients.remove"]!.sideEffect).toBe("destructive");
    expect(operations["email.verify.batch.create"]!.sideEffect).toBe("write");
    expect(operations["people.linkedin.batch.create"]!.sideEffect).toBe("write");
    expect(operations["people.search"]!.sideEffect).toBe("read");
    expect(operations["people.enrich"]!.sideEffect).toBe("read");
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
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
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented ContactOut paths and Composio aliases", () => {
    expect(requestOf("linkedin.enrich").path).toBe("/v1/linkedin/enrich");
    expect(requestOf("people.enrich").path).toBe("/v1/people/enrich");
    expect(requestOf("people.search").path).toBe("/v1/people/search");
    expect(requestOf("people.count").path).toBe("/v1/people/count");
    expect(requestOf("people.linkedin.get").path).toBe("/v1/people/linkedin");
    expect(requestOf("people.linkedin.batch").path).toBe("/v1/people/linkedin/batch");
    expect(requestOf("people.linkedin.batch.create").path).toBe("/v2/people/linkedin/batch");
    expect(requestOf("people.linkedin.batch.job.get").path).toBe("/v2/people/linkedin/batch/{{job_id}}");
    expect(requestOf("people.linkedin.contact-availability").path).toBe("/v1/people/linkedin/{{contact_type}}_status");
    expect(requestOf("email.verify.batch.create").path).toBe("/v1/email/verify/batch");
    expect(requestOf("campaigns.recipients.remove").method).toBe("DELETE");
    expect(requestOf("campaigns.recipients.remove").body).toEqual({ recipients: "{{recipients}}" });
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/contactout/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("contactout compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ status_code: 200 }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.contactout.com");
      expect(requests[0]!.headers.get("token"), key).toBe("dummy");
      expect(requests[0]!.headers.get("authorization"), key).toBe("basic");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "contactout", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v1/stats", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ status_code: 200, usage: {} }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/stats");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("stats.get", {}, () => jsonResponse({ status_code: 200 }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.contactout.com/v1/stats");
    const filtered = await invoke("stats.get", { period: "2023-04" }, () => jsonResponse({ status_code: 200 }));
    expect(new URL(filtered.requests[0]!.url).searchParams.get("period")).toBe("2023-04");
  });

  test("people.linkedin.contact-availability interpolates contact_type into the checker path", async () => {
    const personal = await invoke(
      "people.linkedin.contact-availability",
      { profile: "https://www.linkedin.com/in/example-person", contact_type: "personal_email" },
      () => jsonResponse({ status_code: 200, profile: { email: true } }),
    );
    expect(new URL(personal.requests[0]!.url).pathname).toBe("/v1/people/linkedin/personal_email_status");
    const phone = await invoke(
      "people.linkedin.contact-availability",
      { profile: "https://www.linkedin.com/in/example-person", contact_type: "phone" },
      () => jsonResponse({ status_code: 200, profile: { phone: true } }),
    );
    expect(new URL(phone.requests[0]!.url).pathname).toBe("/v1/people/linkedin/phone_status");
  });

  test("people.search omits unset filters and keeps array types", async () => {
    const { requests } = await invoke(
      "people.search",
      { name: "Jane Doe", job_title: ["Vice President"], reveal_info: false },
      () => jsonResponse({ status_code: 200, profiles: [] }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/people/search");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      job_title: ["Vice President"],
      name: "Jane Doe",
      reveal_info: false,
    });
  });

  test("campaigns.recipients.remove sends a DELETE JSON body", async () => {
    const { requests } = await invoke(
      "campaigns.recipients.remove",
      { campaign_id: "pEVRKd", recipients: [{ email: "jane.doe@example.com" }] },
      () => jsonResponse({ status_code: 200, success_count: 1, failure_count: 0, results: [] }),
    );
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/campaigns/pEVRKd/recipients");
    expect(await requests[0]!.json()).toEqual({ recipients: [{ email: "jane.doe@example.com" }] });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("campaigns.get", { campaign_id: "pE/VRKd" }, () => jsonResponse({ status_code: 200 }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/campaigns/pE%2FVRKd");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile?: string };
        }>;
        expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
      };
      const action = compiled.actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const rawBody = init?.body == null ? null : String(init.body);
        if (expected.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (typeof expected.request.body === "object") {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expected.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
        }
        const got = new Headers(init?.headers);
        for (const [headerKey, value] of Object.entries(expected.request.headers ?? {})) {
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
        }
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
        const bodyBytes = expected.response.bodyFile
          ? readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile))
          : Buffer.from("{}");
        return new Response(bodyBytes, { status, headers: expected.response.headers });
      };
      const input = { ...raw.input, ...raw.credentials, fetch: fetchStub };
      if (raw.expected.kind === "error") {
        let rejected: { code?: string } | undefined;
        try {
          await action!(input);
        } catch (error) {
          rejected = error as { code?: string };
        }
        expect(index, raw.id).toBe(raw.exchanges.length);
        expect(rejected?.code, raw.id).toBe(raw.expected.code);
        continue;
      }
      const result = await action!(input);
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
