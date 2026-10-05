import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import {
  executeFormsList,
  executeFormsGet,
  executeFormsCreate,
  executeFormTemplatesList,
  executeFormTemplatesGet,
} from "../src/sync";

const OPP = "3410c8b9-5c31-4bab-b7e9-9f710206d647";
const USER = "8d49b010-cc6a-4f40-ace5-e86061c677ed";
const FORM = "d0cc2b88-ccd4-4947-8f1b-97df6166904b";
const TPL = "806ad14a-2fe5-4b42-b2da-3f90dc0a16d9";
const NEW_FORM = "5b0f589c-b0c2-4e84-bf83-0f2ca48fc48a";

const G3_OPS = ["forms.list", "forms.get", "forms.create", "form_templates.list", "form_templates.get"] as const;
const READS = ["forms.list", "forms.get", "form_templates.list", "form_templates.get"] as const;

type Op = Record<string, unknown> & {
  request?: { method?: string; path?: string; query?: Record<string, string>; body?: Record<string, string>; success?: number[] };
  inputSchema?: { required?: string[]; properties: Record<string, Record<string, unknown>> };
};
const ops = manifest.operations as unknown as Record<string, Op>;

const FIELDS = [
  { type: "date", text: "Start Date", required: true, value: 1418716800000 },
  { type: "currency", text: "Compensation", required: true, value: 75000 },
];

function queueFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input as string, init));
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    const status = next.status ?? 200;
    const body = status === 204 || next.body === undefined ? null : JSON.stringify(next.body);
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const eu = { apiKey: "fixturekey", region: "eu" };

describe("Lever G3 manifest locks (v0.8.0 / 58)", () => {
  test("version and op count", () => {
    expect(manifest.version).toBe("0.8.0");
    expect(Object.keys(ops)).toHaveLength(58);
    for (const id of G3_OPS) expect(ops[id]).toBeTruthy();
  });

  test("every G3 op is an action with strict schemas", () => {
    for (const id of G3_OPS) {
      expect(ops[id].kind).toBe("action");
      expect(ops[id].enforceOutputSchema).toBe(true);
      expect(ops[id].validationMode).toBe("strict-generated");
      expect((ops[id].inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
      expect(ops[id].outputSchema).toEqual({
        type: "object",
        additionalProperties: false,
        required: ["data"],
        properties: { data: { type: "object" } },
      });
    }
  });

  test("sideEffect split: 4 read, 1 write (create)", () => {
    for (const id of READS) expect(ops[id].sideEffect).toBe("read");
    expect(ops["forms.create"].sideEffect).toBe("write");
  });

  test("all 5 omit effect keys (creates always omit; no pure update in G3)", () => {
    for (const id of G3_OPS) {
      expect(Object.hasOwn(ops[id], "effectPolicy")).toBe(false);
      expect(Object.hasOwn(ops[id], "reconcile")).toBe(false);
      expect(Object.hasOwn(ops[id], "effect")).toBe(false);
    }
  });

  test("official Lever v1 paths and wire mapping", () => {
    expect(ops["forms.list"].request).toEqual({
      method: "GET",
      path: "/opportunities/{{opportunityId}}/forms",
      query: { limit: "{{limit}}", offset: "{{offset}}" },
      success: [200],
    });
    expect(ops["forms.get"].request).toEqual({
      method: "GET",
      path: "/opportunities/{{opportunityId}}/forms/{{formId}}",
      success: [200],
    });
    expect(ops["forms.create"].request).toEqual({
      method: "POST",
      path: "/opportunities/{{opportunityId}}/forms",
      query: { perform_as: "{{performAs}}" },
      body: { baseTemplateId: "{{baseTemplateId}}", fields: "{{fields}}", secret: "{{secret}}" },
      success: [200, 201],
    });
    expect(ops["form_templates.list"].request).toEqual({
      method: "GET",
      path: "/form_templates",
      query: { include: "{{include}}", limit: "{{limit}}", offset: "{{offset}}" },
      success: [200],
    });
    expect(ops["form_templates.get"].request).toEqual({
      method: "GET",
      path: "/form_templates/{{formTemplateId}}",
      success: [200],
    });
  });

  test("forms.create requires baseTemplateId + non-empty object fields; performAs optional", () => {
    const schema = ops["forms.create"].inputSchema!;
    expect(schema.required).toEqual(["opportunityId", "baseTemplateId", "fields"]);
    expect(schema.properties.fields).toMatchObject({ type: "array", minItems: 1, items: { type: "object" } });
    expect(schema.properties.performAs).toBeTruthy();
    expect(schema.properties.completedAt).toBeUndefined();
  });

  test("form_templates.list include is an enum array of text/group/fields", () => {
    expect(ops["form_templates.list"].inputSchema!.properties.include).toMatchObject({
      type: "array",
      minItems: 1,
      items: { type: "string", enum: ["text", "group", "fields"] },
    });
  });
});

describe("Lever G3 handlers route to the region host", () => {
  test("forms.list / forms.get / form_templates.get hit api.eu.lever.co", async () => {
    const { calls, impl } = queueFetch([
      { body: { data: [{ id: FORM }], hasNext: false } },
      { body: { data: { id: FORM, baseTemplateId: TPL } } },
      { body: { data: { id: TPL, text: "Offer information" } } },
    ]);
    const list = await executeFormsList({ ...eu, opportunityId: OPP, limit: 5, offset: "tok", fetch: impl });
    const form = await executeFormsGet({ ...eu, opportunityId: OPP, formId: FORM, fetch: impl });
    const tpl = await executeFormTemplatesGet({ ...eu, formTemplateId: TPL, fetch: impl });
    expect(list.data).toEqual({ data: [{ id: FORM }], hasNext: false });
    expect(form.data).toEqual({ data: { id: FORM, baseTemplateId: TPL } });
    expect(tpl.data).toEqual({ data: { id: TPL, text: "Offer information" } });
    const urls = calls.map((c) => new URL(c.url));
    expect(urls.every((u) => u.hostname === "api.eu.lever.co")).toBe(true);
    expect(urls[0].pathname).toBe(`/v1/opportunities/${OPP}/forms`);
    expect(urls[0].searchParams.get("limit")).toBe("5");
    expect(urls[0].searchParams.get("offset")).toBe("tok");
    expect(urls[1].pathname).toBe(`/v1/opportunities/${OPP}/forms/${FORM}`);
    expect(urls[2].pathname).toBe(`/v1/form_templates/${TPL}`);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  test("form_templates.list sends repeated include= params", async () => {
    const { calls, impl } = queueFetch([{ body: { data: [], hasNext: false } }]);
    await executeFormTemplatesList({ ...eu, include: ["text", "group"], limit: 50, fetch: impl });
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.eu.lever.co");
    expect(url.pathname).toBe("/v1/form_templates");
    expect(url.searchParams.getAll("include")).toEqual(["text", "group"]);
    expect(url.searchParams.get("limit")).toBe("50");
  });

  test("form_templates.list rejects unknown include values before fetch", async () => {
    const { calls, impl } = queueFetch([]);
    await expect(executeFormTemplatesList({ ...eu, include: ["secretByDefault"], fetch: impl })).rejects.toThrow(
      "include entries must be text, group or fields",
    );
    expect(calls).toHaveLength(0);
  });

  test("forms.create POSTs body + optional perform_as to the EU host", async () => {
    const created = { data: { id: NEW_FORM, baseTemplateId: TPL, fields: FIELDS } };
    const { calls, impl } = queueFetch([{ status: 201, body: created }]);
    const result = await executeFormsCreate({
      ...eu,
      opportunityId: OPP,
      baseTemplateId: TPL,
      fields: FIELDS,
      secret: true,
      performAs: USER,
      fetch: impl,
    });
    expect(result).toEqual({ data: created });
    const url = new URL(calls[0].url);
    expect(calls[0].method).toBe("POST");
    expect(url.hostname).toBe("api.eu.lever.co");
    expect(url.pathname).toBe(`/v1/opportunities/${OPP}/forms`);
    expect(url.searchParams.get("perform_as")).toBe(USER);
    expect(await calls[0].json()).toEqual({ baseTemplateId: TPL, fields: FIELDS, secret: true });
  });

  test("forms.create without performAs omits the query; tolerates a non-enveloped 201", async () => {
    const bare = { id: NEW_FORM, baseTemplateId: TPL };
    const { calls, impl } = queueFetch([{ status: 201, body: bare }]);
    const result = await executeFormsCreate({ ...eu, opportunityId: OPP, baseTemplateId: TPL, fields: FIELDS, fetch: impl });
    expect(result).toEqual({ data: bare });
    expect(new URL(calls[0].url).search).toBe("");
    expect(await calls[0].json()).toEqual({ baseTemplateId: TPL, fields: FIELDS });
  });

  test("forms.create rejects empty fields / missing template before fetch", async () => {
    const { calls, impl } = queueFetch([]);
    await expect(
      executeFormsCreate({ ...eu, opportunityId: OPP, baseTemplateId: TPL, fields: [], fetch: impl }),
    ).rejects.toThrow("fields must be a non-empty array");
    await expect(
      executeFormsCreate({ ...eu, opportunityId: OPP, baseTemplateId: "", fields: FIELDS, fetch: impl }),
    ).rejects.toThrow("baseTemplateId is required");
    expect(calls).toHaveLength(0);
  });

  test("forms.get 404 → CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = queueFetch([{ status: 404, body: { code: "ResourceNotFound", message: "Form not found" } }]);
    await expect(executeFormsGet({ ...eu, opportunityId: OPP, formId: FORM, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("dot-segment ids are rejected before fetch", async () => {
    const { calls, impl } = queueFetch([]);
    await expect(executeFormTemplatesGet({ ...eu, formTemplateId: "..", fetch: impl })).rejects.toThrow();
    await expect(executeFormsGet({ ...eu, opportunityId: OPP, formId: "..", fetch: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("Lever G3 through the runner registry", () => {
  test("every G3 op dispatches to the EU-aware handler (region=eu)", async () => {
    const cases: [string, Record<string, unknown>, string, string][] = [
      ["forms.list", { opportunityId: OPP }, "GET", `/v1/opportunities/${OPP}/forms`],
      ["forms.get", { opportunityId: OPP, formId: FORM }, "GET", `/v1/opportunities/${OPP}/forms/${FORM}`],
      ["forms.create", { opportunityId: OPP, baseTemplateId: TPL, fields: FIELDS }, "POST", `/v1/opportunities/${OPP}/forms`],
      ["form_templates.list", { include: ["fields"] }, "GET", "/v1/form_templates"],
      ["form_templates.get", { formTemplateId: TPL }, "GET", `/v1/form_templates/${TPL}`],
    ];
    for (const [action, input, method, path] of cases) {
      const { calls, impl } = queueFetch([{ status: method === "POST" ? 201 : 200, body: { data: { id: "x" } } }]);
      const result = defaultConnectorRegistry.executeAction("lever", action, { ...eu, ...input, fetch: impl });
      expect(result.ok).toBe(true);
      const output = result.ok ? await Promise.resolve(result.output) : undefined;
      expect(output).toMatchObject({ data: { data: { id: "x" } } });
      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe(method);
      const url = new URL(calls[0].url);
      expect(url.hostname).toBe("api.eu.lever.co");
      expect(url.pathname).toBe(path);
    }
  });

  test("forms.create is a single POST with no observe", async () => {
    const { calls, impl } = queueFetch([{ status: 201, body: { data: { id: NEW_FORM } } }]);
    const result = defaultConnectorRegistry.executeAction("lever", "forms.create", {
      ...eu,
      opportunityId: OPP,
      baseTemplateId: TPL,
      fields: FIELDS,
      performAs: USER,
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    if (result.ok) await Promise.resolve(result.output);
    expect(calls).toHaveLength(1);
  });

  test("registry path rejects invalid input in the handler before any fetch", async () => {
    for (const [action, input] of [
      ["forms.create", { opportunityId: OPP, baseTemplateId: TPL }],
      ["forms.create", { opportunityId: OPP, baseTemplateId: TPL, fields: ["not-an-object"] }],
      ["form_templates.list", { include: ["secretByDefault"] }],
      ["form_templates.list", { limit: 0 }],
      ["forms.list", { opportunityId: OPP, limit: 101 }],
      ["form_templates.get", {}],
    ] as [string, Record<string, unknown>][]) {
      const { calls, impl } = queueFetch([]);
      const result = defaultConnectorRegistry.executeAction("lever", action, { ...eu, ...input, fetch: impl });
      let rejected = !result.ok;
      if (result.ok) {
        try {
          await Promise.resolve(result.output);
        } catch {
          rejected = true;
        }
      }
      expect(rejected).toBe(true);
      expect(calls).toHaveLength(0);
    }
  });
});
