import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";
import cases from "../fixtures/advanced_requests.json";
import contactsAllPages from "../fixtures/contacts_all_pages.json";
import operationSpecs from "../src/advanced_ops.json";
import { executeResendOperation, resendAdvancedActions } from "../src/advanced";

type ExpectedRequest = {
  method: string;
  path: string;
  body: unknown;
  responseBody?: unknown;
};
type OperationVector = ExpectedRequest & {
  operation: string;
  input: Record<string, unknown>;
  requests?: ExpectedRequest[];
};

const vectors = cases as OperationVector[];
const advancedSpecs = operationSpecs as Record<string, any>;

function createRecorder(responses: Array<{ body: unknown; status?: number }> = []) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let responseIndex = 0;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses[responseIndex++];
    return Response.json(response?.body ?? { id: "fixture-id", object: "fixture" }, {
      status: response?.status ?? 200,
    });
  };
  return { calls, fetch };
}

describe("Resend advanced operations", () => {
  it("registers exactly the fixture-backed action set with complete MCP schemas", () => {
    const keys = vectors.map((vector) => vector.operation).sort();
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(resendAdvancedActions).sort()).toEqual(keys);
    for (const key of keys) {
      const operation = manifest.operations[key as keyof typeof manifest.operations] as any;
      expect(operation?.kind).toBe("action");
      expect(operation?.title).toBeTruthy();
      expect(operation?.description).toBeTruthy();
      expect(operation?.inputSchema?.type).toBe("object");
      expect(operation?.sideEffect).toBeTruthy();
    }
  });

  for (const vector of vectors) {
    it(vector.operation + " performs its documented HTTP request", async () => {
      const expectedRequests = vector.requests ?? [vector];
      const { calls, fetch } = createRecorder(expectedRequests.map((request) => ({
        body: request.responseBody ?? { id: "fixture-id", object: "fixture" },
      })));
      const result = await executeResendOperation(vector.operation, {
        ...vector.input,
        apiKey: "re_fixture",
        fetch,
      });
      expect(calls).toHaveLength(expectedRequests.length);
      expectedRequests.forEach((request, index) => {
        const call = calls[index];
        expect(call.url).toBe("https://api.resend.com" + request.path);
        expect(call.init.method).toBe(request.method);
        expect(new Headers(call.init.headers).get("authorization")).toBe("Bearer re_fixture");
        if (request.body === null) {
          expect(call.init.body).toBeUndefined();
        } else {
          expect(JSON.parse(String(call.init.body))).toEqual(request.body);
        }
      });
      expect(result).toMatchObject({ connector: "resend", action: vector.operation, source: "provider" });
    });
  }

  it("validates required fields before issuing a request", async () => {
    const { calls, fetch } = createRecorder();
    await expect(executeResendOperation("emails.cancel", { apiKey: "re_fixture", fetch }))
      .rejects.toThrow("id is required");
    expect(calls).toHaveLength(0);
  });

  it("rejects unsafe path identifiers before fetching and keeps ordinary IDs intact", async () => {
    for (const contactId of [".", "..", "contact/id", "contact\\id", "contact\u0000id"]) {
      const { calls, fetch } = createRecorder();
      await expect(executeResendOperation("contacts.segments.remove", {
        contactId,
        segmentId: "segment-id",
        apiKey: "re_fixture",
        fetch,
      })).rejects.toThrow("contactId must be a safe path identifier");
      expect(calls).toHaveLength(0);
    }

    const { calls, fetch } = createRecorder();
    await executeResendOperation("contacts.segments.remove", {
      contactId: "contact-123",
      segmentId: "segment-456",
      apiKey: "re_fixture",
      fetch,
    });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.resend.com/contacts/contact-123/segments/segment-456",
    ]);
  });

  it("collects all contact pages up to its documented page bound", async () => {
    const pages = contactsAllPages as Array<{ data: Array<{ id: string }>; has_more: boolean }>;
    const urls: string[] = [];
    let pageIndex = 0;
    const result = await executeResendOperation("contacts.list_all", {
      apiKey: "re_fixture",
      fetch: async (input) => {
        urls.push(String(input));
        return Response.json(pages[pageIndex++]);
      },
    });
    expect(urls).toEqual([
      "https://api.resend.com/contacts?limit=100",
      "https://api.resend.com/contacts?limit=100&after=contact-1",
    ]);
    expect((result.data as { data: unknown[] }).data).toEqual([{ id: "contact-1" }, { id: "contact-2" }]);
    expect((result.data as { has_more: boolean }).has_more).toBe(false);
  });

  it("maps rate limits without exposing the API key", async () => {
    await expect(executeResendOperation("webhooks.list", {
      apiKey: "re_secret_fixture",
      fetch: async () => new Response("rate limited", { status: 429, headers: { "retry-after": "7" } }),
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 7,
    });
  });

  it("keeps fixture validation echoes out of provider calls", async () => {
    const { calls, fetch } = createRecorder();
    const result = await executeResendOperation("webhooks.list", { fetch });
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ connector: "resend", action: "webhooks.list", source: "connector" });
  });
});

describe("Resend remediation regressions", () => {
  it("marks cancelling a scheduled email destructive in source and runtime manifests", () => {
    expect(manifest.operations["emails.cancel"].sideEffect).toBe("destructive");
    expect(advancedSpecs["emails.cancel"].sideEffect).toBe("destructive");
  });

  it("marks every DELETE operation destructive while webhooks remain read-only", () => {
    const operations = manifest.operations as Record<string, any>;
    const deletes = Object.entries(advancedSpecs)
      .filter(([, spec]) => spec.method === "DELETE")
      .map(([name]) => name)
      .sort();

    expect(deletes.length).toBeGreaterThan(0);
    for (const name of deletes) {
      expect(operations[name]?.sideEffect).toBe("destructive");
      expect(advancedSpecs[name].sideEffect).toBe("destructive");
    }
    for (const operation of Object.values(operations)) {
      if ((operation as any).kind === "webhook") {
        expect((operation as any).sideEffect).toBe("read");
      }
    }
  });

  it("uses Resend's sending_access API key permission and rejects the obsolete spelling", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("api_keys.create", {
      name: "limited-key",
      permission: "sending_access",
      apiKey: "re_fixture",
      fetch,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "limited-key",
      permission: "sending_access",
    });

    const rejected = createRecorder();
    await expect(executeResendOperation("api_keys.create", {
      name: "limited-key",
      permission: "sending",
      apiKey: "re_fixture",
      fetch: rejected.fetch,
    })).rejects.toThrow();
    expect(rejected.calls).toHaveLength(0);
  });

  it("wraps topic subscription updates in the provider topics object", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("contacts.topics.update", {
      contactId: "contact-id",
      topics: [{ id: "topic-id", subscription: "opt_in" }],
      apiKey: "re_fixture",
      fetch,
    });
    expect(calls[0].url).toBe("https://api.resend.com/contacts/contact-id/topics");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      topics: [{ id: "topic-id", subscription: "opt_in" }],
    });
  });

  it("allows numeric contact-property fallbacks, rejects unsupported types, and keeps identity immutable", async () => {
    const create = createRecorder();
    await executeResendOperation("contact_properties.create", {
      key: "plan_rank",
      type: "number",
      fallbackValue: 3.5,
      apiKey: "re_fixture",
      fetch: create.fetch,
    });
    expect(JSON.parse(String(create.calls[0].init.body))).toEqual({
      key: "plan_rank",
      type: "number",
      fallback_value: 3.5,
    });

    const update = createRecorder();
    await executeResendOperation("contact_properties.update", {
      id: "property-id",
      fallbackValue: 4,
      apiKey: "re_fixture",
      fetch: update.fetch,
    });
    expect(JSON.parse(String(update.calls[0].init.body))).toEqual({ fallback_value: 4 });

    for (const type of ["boolean", "date"]) {
      const invalid = createRecorder();
      await expect(executeResendOperation("contact_properties.create", {
        key: "unsupported",
        type,
        apiKey: "re_fixture",
        fetch: invalid.fetch,
      })).rejects.toThrow();
      expect(invalid.calls).toHaveLength(0);
    }

    const mismatchedFallback = createRecorder();
    await expect(executeResendOperation("contact_properties.create", {
      key: "company",
      type: "string",
      fallbackValue: 42,
      apiKey: "re_fixture",
      fetch: mismatchedFallback.fetch,
    })).rejects.toThrow(/fallbackValue/i);
    expect(mismatchedFallback.calls).toHaveLength(0);

    const immutable = createRecorder();
    await expect(executeResendOperation("contact_properties.update", {
      id: "property-id",
      key: "renamed",
      type: "string",
      apiKey: "re_fixture",
      fetch: immutable.fetch,
    })).rejects.toThrow();
    expect(immutable.calls).toHaveLength(0);
  });

  it("requires HTML for template creation and rejects reserved variable keys", async () => {
    const textOnly = createRecorder();
    await expect(executeResendOperation("templates.create", {
      name: "text-only",
      text: "This must not be accepted without HTML.",
      apiKey: "re_fixture",
      fetch: textOnly.fetch,
    })).rejects.toThrow();
    expect(textOnly.calls).toHaveLength(0);

    const reserved = createRecorder();
    await expect(executeResendOperation("templates.create", {
      name: "reserved",
      html: "<p>{{{FIRST_NAME}}}</p>",
      variables: [{ key: "FIRST_NAME", type: "string" }],
      apiKey: "re_fixture",
      fetch: reserved.fetch,
    })).rejects.toThrow(/reserved/i);
    expect(reserved.calls).toHaveLength(0);

    const sample = advancedSpecs["templates.create"].sample;
    expect(sample.variables[0].key).not.toBe("FIRST_NAME");
  });

  it("sends numeric template fallback values using the provider field name", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("templates.create", {
      name: "order-confirmation",
      html: "<p>Total: {{{PRICE}}}</p>",
      variables: [{ key: "PRICE", type: "number", fallbackValue: 25 }],
      apiKey: "re_fixture",
      fetch,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "order-confirmation",
      html: "<p>Total: {{{PRICE}}}</p>",
      variables: [{ key: "PRICE", type: "number", fallback_value: 25 }],
    });
  });

  it("supports only string and number template variables and fallback values", async () => {
    const variables = [
      { key: "PRODUCT", type: "string", fallbackValue: "item" },
      { key: "PRICE", type: "number", fallbackValue: 20 },
    ];
    const expectedVariables = [
      { key: "PRODUCT", type: "string", fallback_value: "item" },
      { key: "PRICE", type: "number", fallback_value: 20 },
    ];
    for (const operation of ["templates.create", "templates.update"]) {
      const manifestSchema = (manifest.operations as Record<string, any>)[operation].inputSchema;
      const sourceSchema = advancedSpecs[operation].inputSchema;
      for (const schema of [manifestSchema, sourceSchema]) {
        expect(schema.properties.variables.items.properties.type.enum)
          .toEqual(["string", "number"]);
        expect(schema.properties.variables.items.properties.fallbackValue.type)
          .toEqual(["string", "number"]);
      }

      const recorder = createRecorder();
      await executeResendOperation(operation, {
        ...(operation === "templates.create"
          ? { name: "typed-template", html: "<p>{{{PRODUCT}}}: {{{PRICE}}}</p>" }
          : { id: "typed-template", html: "<p>{{{PRODUCT}}}: {{{PRICE}}}</p>" }),
        variables,
        apiKey: "re_fixture",
        fetch: recorder.fetch,
      });
      expect(JSON.parse(String(recorder.calls[0].init.body))).toMatchObject({
        variables: expectedVariables,
      });
    }

    const unsupportedVariables = [
      { key: "ENABLED", type: "boolean", fallbackValue: false },
      { key: "CUSTOMER", type: "object", fallbackValue: { name: "Ada" } },
      { key: "ITEMS", type: "list", fallbackValue: ["one"] },
    ];
    for (const operation of ["templates.create", "templates.update"]) {
      for (const variable of unsupportedVariables) {
        const recorder = createRecorder();
        await expect(executeResendOperation(operation, {
          ...(operation === "templates.create" ? { name: "typed-template", html: "<p>Hi</p>" } : { id: "typed-template" }),
          variables: [variable],
          apiKey: "re_fixture",
          fetch: recorder.fetch,
        })).rejects.toThrow();
        expect(recorder.calls).toHaveLength(0);
      }

      for (const fallbackValue of [true, { name: "Ada" }, ["one"]]) {
        const recorder = createRecorder();
        await expect(executeResendOperation(operation, {
          ...(operation === "templates.create" ? { name: "typed-template", html: "<p>Hi</p>" } : { id: "typed-template" }),
          variables: [{ key: "VALUE", type: "string", fallbackValue }],
          apiKey: "re_fixture",
          fetch: recorder.fetch,
        })).rejects.toThrow();
        expect(recorder.calls).toHaveLength(0);
      }
    }
  });

  it("duplicates templates without requiring or sending a name", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("templates.duplicate", {
      id: "template-id",
      apiKey: "re_fixture",
      fetch,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/templates/template-id/duplicate");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("rejects unsupported update fields before network I/O", async () => {
    const cases = [
      ["broadcasts.update", { id: "broadcast-id", scheduledAt: "2026-10-07T10:00:00Z" }],
      ["domains.update", { id: "domain-id", name: "renamed.example.com" }],
      ["domains.update", { id: "domain-id", customReturnPath: "mail.example.com" }],
      ["topics.update", { id: "topic-id", defaultSubscription: "opt_in" }],
    ] as Array<[string, Record<string, unknown>]>;

    for (const [operation, input] of cases) {
      const { calls, fetch } = createRecorder();
      await expect(executeResendOperation(operation, { ...input, apiKey: "re_fixture", fetch }))
        .rejects.toThrow();
      expect(calls).toHaveLength(0);
    }
  });

  it("does not expose a draft-only update without provider-side conditional mutation", async () => {
    const { calls, fetch } = createRecorder([
      { body: { object: "broadcast", id: "broadcast-id", status: "draft", scheduled_at: null } },
      { body: { object: "broadcast", id: "broadcast-id", status: "scheduled" } },
    ]);
    expect((manifest.operations as Record<string, unknown>)["broadcasts.update_draft"]).toBeUndefined();
    expect(advancedSpecs["broadcasts.update_draft"]).toBeUndefined();
    expect(resendAdvancedActions["broadcasts.update_draft"]).toBeUndefined();
    await expect(executeResendOperation("broadcasts.update_draft", {
      id: "broadcast-id",
      name: "Draft v2",
      apiKey: "re_fixture",
      fetch,
    })).rejects.toThrow("Unknown Resend operation");
    expect(calls).toHaveLength(0);
  });

  it("serializes broadcast name and array reply-to fields on create", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("broadcasts.create_draft", {
      name: "Monthly Update",
      segmentId: "segment-id",
      from: "team@example.com",
      subject: "News",
      html: "<p>News</p>",
      replyTo: ["support@example.com", "team@example.com"],
      apiKey: "re_fixture",
      fetch,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/broadcasts");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Monthly Update",
      segment_id: "segment-id",
      from: "team@example.com",
      subject: "News",
      html: "<p>News</p>",
      reply_to: ["support@example.com", "team@example.com"],
    });
    const properties = (manifest.operations as Record<string, any>)["broadcasts.create_draft"].inputSchema.properties;
    expect(properties.name.type).toBe("string");
    expect(properties.replyTo.type).toEqual(["string", "array"]);
  });

  it("serializes broadcast name and array reply-to fields on update", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("broadcasts.update", {
      id: "broadcast-id",
      name: "Renamed Campaign",
      subject: "Updated",
      replyTo: ["support@example.com", "team@example.com"],
      apiKey: "re_fixture",
      fetch,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/broadcasts/broadcast-id");
    expect(calls[0].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Renamed Campaign",
      subject: "Updated",
      reply_to: ["support@example.com", "team@example.com"],
    });
    expect((manifest.operations as Record<string, any>)["broadcasts.update"].description)
      .toContain("broadcast is scheduled");
    const properties = (manifest.operations as Record<string, any>)["broadcasts.update"].inputSchema.properties;
    expect(properties.name.type).toBe("string");
    expect(properties.replyTo.type).toEqual(["string", "array"]);
  });

  it("normalizes scalar broadcast reply-to values and serializes preview text", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("broadcasts.create_draft", {
      segmentId: "segment-id",
      from: "team@example.com",
      subject: "News",
      html: "<p>News</p>",
      previewText: "A short preview",
      replyTo: "support@example.com",
      apiKey: "re_fixture",
      fetch,
    });
    await executeResendOperation("broadcasts.update", {
      id: "broadcast-id",
      previewText: "Updated preview",
      replyTo: "help@example.com",
      apiKey: "re_fixture",
      fetch,
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      preview_text: "A short preview",
      reply_to: ["support@example.com"],
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      preview_text: "Updated preview",
      reply_to: ["help@example.com"],
    });
  });

  it("rejects undocumented broadcast tags before provider requests", async () => {
    const { calls, fetch } = createRecorder();
    await expect(executeResendOperation("broadcasts.create_draft", {
      segmentId: "segment-id",
      from: "team@example.com",
      subject: "News",
      html: "<p>News</p>",
      tags: [{ name: "campaign", value: "monthly" }],
      apiKey: "re_fixture",
      fetch,
    })).rejects.toThrow("input.tags is not allowed");
    await expect(executeResendOperation("broadcasts.update", {
      id: "broadcast-id",
      tags: [{ name: "campaign", value: "monthly" }],
      apiKey: "re_fixture",
      fetch,
    })).rejects.toThrow("input.tags is not allowed");
    expect(calls).toHaveLength(0);
  });

  it("serializes supported topic description and visibility fields", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("topics.create", {
      name: "Product updates",
      defaultSubscription: "opt_in",
      description: "Product news and releases",
      visibility: "public",
      apiKey: "re_fixture",
      fetch,
    });
    await executeResendOperation("topics.update", {
      id: "topic-id",
      description: "Release notes",
      visibility: "private",
      apiKey: "re_fixture",
      fetch,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Product updates",
      default_subscription: "opt_in",
      description: "Product news and releases",
      visibility: "public",
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      description: "Release notes",
      visibility: "private",
    });
    expect(advancedSpecs["topics.create"].inputSchema.properties.description.maxLength).toBe(200);
    expect(advancedSpecs["topics.update"].inputSchema.properties.visibility.enum).toEqual(["public", "private"]);
  });

  it("enforces Resend topic field lengths before issuing a request", async () => {
    const { calls, fetch } = createRecorder();
    await expect(executeResendOperation("topics.create", {
      name: "n".repeat(51),
      defaultSubscription: "opt_in",
      apiKey: "re_fixture",
      fetch,
    })).rejects.toThrow("input.name must contain at most 50 characters");
    await expect(executeResendOperation("topics.update", {
      id: "topic-id",
      description: "d".repeat(201),
      apiKey: "re_fixture",
      fetch,
    })).rejects.toThrow("input.description must contain at most 200 characters");
    expect(calls).toHaveLength(0);
  });

  it("serializes supported template sender, alias, subject, and reply-to fields", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("templates.create", {
      name: "Welcome",
      alias: "welcome-email",
      from: "team@example.com",
      subject: "Welcome",
      html: "<p>Hello</p>",
      replyTo: "support@example.com",
      apiKey: "re_fixture",
      fetch,
    });
    await executeResendOperation("templates.update", {
      id: "welcome-email",
      alias: "welcome-v2",
      from: "help@example.com",
      subject: "Updated welcome",
      replyTo: ["support@example.com", "help@example.com"],
      apiKey: "re_fixture",
      fetch,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "Welcome",
      alias: "welcome-email",
      from: "team@example.com",
      subject: "Welcome",
      html: "<p>Hello</p>",
      reply_to: ["support@example.com"],
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      alias: "welcome-v2",
      from: "help@example.com",
      subject: "Updated welcome",
      reply_to: ["support@example.com", "help@example.com"],
    });
  });

  it("serializes domain TLS policy and contact segment/topic memberships", async () => {
    const { calls, fetch } = createRecorder();
    await executeResendOperation("domains.create", {
      name: "example.com",
      tls: "enforced",
      apiKey: "re_fixture",
      fetch,
    });
    await executeResendOperation("domains.update", {
      id: "domain-id",
      tls: "opportunistic",
      apiKey: "re_fixture",
      fetch,
    });
    await executeResendOperation("contacts.create_v2", {
      email: "person@example.com",
      segments: [{ id: "segment-id" }],
      topics: [{ id: "topic-id", subscription: "opt_in" }],
      apiKey: "re_fixture",
      fetch,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "example.com", tls: "enforced" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ tls: "opportunistic" });
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      email: "person@example.com",
      segments: [{ id: "segment-id" }],
      topics: [{ id: "topic-id", subscription: "opt_in" }],
    });
  });

  it("paginates contacts inside a segment when segmentId or legacy audienceId is provided", async () => {
    const urls: string[] = [];
    const pages = [
      { data: [{ id: "contact-1" }], has_more: true },
      { data: [{ id: "contact-2" }], has_more: false },
    ];
    let index = 0;
    const result = await executeResendOperation("contacts.list_all", {
      segmentId: "segment-id",
      apiKey: "re_fixture",
      fetch: async (input) => {
        urls.push(String(input));
        return Response.json(pages[index++]);
      },
    });
    expect(urls).toEqual([
      "https://api.resend.com/segments/segment-id/contacts?limit=100",
      "https://api.resend.com/segments/segment-id/contacts?limit=100&after=contact-1",
    ]);
    expect((result.data as { data: unknown[] }).data).toEqual([{ id: "contact-1" }, { id: "contact-2" }]);

    const legacy = createRecorder();
    await executeResendOperation("contacts.list_all", {
      audienceId: "legacy-audience-id",
      apiKey: "re_fixture",
      fetch: legacy.fetch,
    });
    expect(legacy.calls[0].url).toBe("https://api.resend.com/segments/legacy-audience-id/contacts?limit=100");
  });
});

describe("Resend pagination parameter contract", () => {
  it("accepts and sends cursors for every QueryParams-paginated list", async () => {
    const paginatedOperations = [
      { operation: "emails.attachments.list", path: "/emails/email-id/attachments", input: { emailId: "email-id" } },
      { operation: "audiences.list", path: "/audiences", input: {} },
      { operation: "contacts.segments.list", path: "/contacts/contact-id/segments", input: { contactId: "contact-id" } },
      { operation: "contacts.topics.list", path: "/contacts/contact-id/topics", input: { contactId: "contact-id" } },
      { operation: "contact_properties.list", path: "/contact-properties", input: {} },
      { operation: "webhooks.list", path: "/webhooks", input: {} },
    ];
    for (const { operation, path, input } of paginatedOperations) {
      expect(advancedSpecs[operation].queryParams).toEqual(["limit", "after", "before"]);
      expect(advancedSpecs[operation].inputSchema.properties.limit)
        .toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
      expect(advancedSpecs[operation].inputSchema.properties.after.type).toBe("string");
      expect(advancedSpecs[operation].inputSchema.properties.before.type).toBe("string");
      const manifestProperties = (manifest.operations as Record<string, any>)[operation].inputSchema.properties;
      expect(manifestProperties.limit).toEqual(advancedSpecs[operation].inputSchema.properties.limit);
      expect(manifestProperties.after).toEqual(advancedSpecs[operation].inputSchema.properties.after);
      expect(manifestProperties.before).toEqual(advancedSpecs[operation].inputSchema.properties.before);
      const { calls, fetch } = createRecorder();
      await executeResendOperation(operation, {
        ...input,
        limit: 25,
        after: "cursor/next",
        apiKey: "re_fixture",
        fetch,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`https://api.resend.com${path}?limit=25&after=cursor%2Fnext`);
      expect(calls[0].init.method).toBe("GET");
    }

    const { calls, fetch } = createRecorder();
    await executeResendOperation("webhooks.list", {
      limit: 10,
      before: "cursor/previous",
      apiKey: "re_fixture",
      fetch,
    });
    expect(calls[0].url).toBe("https://api.resend.com/webhooks?limit=10&before=cursor%2Fprevious");
  });

  it("keeps cursor support on the previously documented paginated operations", () => {
    for (const operation of ["api_keys.list", "segments.list", "topics.list"]) {
      expect(advancedSpecs[operation].queryParams).toEqual(["limit", "after", "before"]);
      expect(advancedSpecs[operation].inputSchema.properties.limit.minimum).toBe(1);
      expect(advancedSpecs[operation].inputSchema.properties.limit.maximum).toBe(100);
    }
  });
});
