import { expect, it } from "bun:test";
import manifest from "../manifest.json";

const originKeys = [
  "healthcheck",
  "collections.list",
  "collections.get",
  "lists.list",
  "lists.get",
  "members.get",
  "attributes.list",
  "attributes.create",
  "attributes.update",
  "attributes.delete",
  "records.list",
  "records.get",
  "records.create",
  "records.update",
  "records.delete",
  "listEntries.list",
  "listEntries.get",
  "listEntries.create",
  "activities.list",
  "activities.get",
  "activities.create",
];

const added = {
  ZIXFLOW_GET_CAMPAIGN_REPORT_WHATSAPP: {
    path: "/campaign/report/whatsapp/{{messageId}}",
    required: ["messageId"],
  },
  ZIXFLOW_GET_EMAIL_REPORT: {
    path: "/campaign/report/email/{{messageId}}",
    required: ["messageId"],
  },
  ZIXFLOW_GET_SMS_REPORT: {
    path: "/campaign/report/sms/{{messageId}}",
    required: ["messageId"],
  },
  ZIXFLOW_GET_WHATSAPP_TEMPLATE_VARIABLES: {
    path: "/campaign/whatsapp/variable-keys",
    required: ["phoneId", "templateName", "language"],
    query: {
      phoneId: "{{phoneId}}",
      templateName: "{{templateName}}",
      language: "{{language}}",
    },
  },
  ZIXFLOW_LIST_ATTRIBUTES_OPTIONS: {
    path: "/attributes/{{target}}/{{targetId}}/{{attributeId}}/options",
    required: ["target", "targetId", "attributeId"],
  },
  ZIXFLOW_LIST_ATTRIBUTES_STATUS: {
    path: "/attributes/{{target}}/{{targetId}}/{{attributeId}}/status",
    required: ["target", "targetId", "attributeId"],
  },
} as const;

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.full_depth).toBeUndefined();
  expect(manifest.key).toBe("zixflow");
  expect(manifest.http?.baseUrl).toBe("https://api.zixflow.com/api/v1");
  expect(manifest.http?.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.http?.headers).toEqual({ Accept: "application/json" });
  expect(manifest.network?.allowedHosts).toEqual(["api.zixflow.com"]);
  const ops = manifest.operations as Record<string, any>;
  expect(Object.keys(ops)).toEqual([...originKeys, ...Object.keys(added)]);
  expect(ops["attributes.create"].request).toEqual({
    method: "POST",
    path: "/attributes/{{target}}/{{targetId}}",
    success: [200],
    body: {
      apiKeyName: "{{apiKeyName}}",
      inputType: "{{inputType}}",
      name: "{{name}}",
      description: "{{description}}",
    },
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  for (const [key, spec] of Object.entries(added)) {
    const op = ops[key];
    const placeholders = [...op.request.path.matchAll(/\{\{([A-Za-z0-9_.$-]+)\}\}/g)].map((match) => match[1]);
    expect(op.request.method).toBe("GET");
    expect(op.request.path).toBe(spec.path);
    expect(op.request.path.includes("{") && !op.request.path.includes("{{")).toBe(false);
    expect(placeholders).toEqual(spec.path === "/campaign/whatsapp/variable-keys" ? [] : [...spec.required]);
    expect(op.request.body).toBeUndefined();
    expect(op.request.headers).toBeUndefined();
    expect(JSON.stringify(op.request)).not.toContain("Content-Type");
    expect(op.request.query).toEqual("query" in spec ? spec.query : undefined);
    expect(op.inputSchema.required).toEqual([...spec.required]);
    expect(op.inputSchema.additionalProperties).toBe(false);
    expect(op.outputSchema.type).toBe("object");
    expect(op.sideEffect).toBe("read");
    expect(op.responseFormat).toBe("json");
    expect(op.kind).toBe("action");
  }
  expect(ops.ZIXFLOW_LIST_ATTRIBUTES_OPTIONS.inputSchema.properties.target.enum).toEqual(["collection", "list"]);
  expect(ops.ZIXFLOW_LIST_ATTRIBUTES_STATUS.inputSchema.properties.target.enum).toEqual(["collection", "list"]);
  for (const [key, op] of Object.entries(ops) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThanOrEqual(1);
    expect(op.timeoutMs).toBeLessThanOrEqual(300000);
    expect(op.maxInputBytes).toBeLessThanOrEqual(26214400);
    expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      expect(op.sideEffect).toBe("read");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(["read", "write", "destructive"]).toContain(op.sideEffect);
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
    if (typeof op.request?.path === "string") {
      expect(op.request.path).not.toMatch(/(^|[^{])\{[^{]/);
    }
  }
});
