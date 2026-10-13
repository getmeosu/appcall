import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { actions } from "../src/actions";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "contacts.list", "contacts.get", "sequences.list", "sequences.get"] as const;

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "contact_lists.list",
  "contacts.clear_opt_out",
  "contacts.create",
  "contacts.delete",
  "contacts.get",
  "contacts.list",
  "contacts.move_to_sequence",
  "contacts.search",
  "contacts.set_status",
  "contacts.statuses",
  "contacts.update",
  "email_accounts.connect_gmail",
  "email_accounts.connect_office365",
  "email_accounts.delete",
  "email_accounts.list",
  "email_accounts.list_disconnected",
  "email_accounts.update",
  "healthcheck",
  "schedules.delete",
  "sequences.archive",
  "sequences.contacts.remove",
  "sequences.contacts.remove_bulk",
  "sequences.contacts.state",
  "sequences.delete",
  "sequences.get",
  "sequences.list",
  "sequences.pause",
  "sequences.start",
  "sequences.steps.create",
  "sequences.steps.get",
  "sequences.steps.list",
  "ulid.generate",
  "users.list"
] as const;
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "email_accounts.v1.save"
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  REPLY_IO_ADD_CONTACT_TO_SEQUENCE: "contacts.move_to_sequence",
  REPLY_IO_ARCHIVE_SEQUENCE: "sequences.archive",
  REPLY_IO_CLEAR_CONTACT_STATUS: "contacts.clear_opt_out",
  REPLY_IO_CONNECT_EXCHANGE_ACCOUNT: "email_accounts.connect_office365",
  REPLY_IO_CONNECT_GMAIL_ACCOUNT: "email_accounts.connect_gmail",
  REPLY_IO_CREATE_CONTACT: "contacts.create",
  REPLY_IO_CREATE_SEQUENCE_STEP: "sequences.steps.create",
  REPLY_IO_DELETE_CONTACT: "contacts.delete",
  REPLY_IO_DELETE_EMAIL_ACCOUNT: "email_accounts.delete",
  REPLY_IO_DELETE_SCHEDULE: "schedules.delete",
  REPLY_IO_DELETE_SEQUENCE: "sequences.delete",
  REPLY_IO_GENERATE_ULID: "ulid.generate",
  REPLY_IO_GET_CONTACT_BY_ID: "contacts.get",
  REPLY_IO_GET_CONTACT_STATUS: "contacts.statuses",
  REPLY_IO_GET_CURRENT_USER: "healthcheck",
  REPLY_IO_GET_DISCONNECTED_EMAIL_ACCOUNTS: "email_accounts.list_disconnected",
  REPLY_IO_GET_SEQUENCE_BY_ID: "sequences.get",
  REPLY_IO_GET_SEQUENCE_CONTACTS_EXTENDED: "sequences.contacts.state",
  REPLY_IO_GET_SEQUENCE_STEP_BY_ID: "sequences.steps.get",
  REPLY_IO_LIST_CONTACTS_BASIC: "contacts.list",
  REPLY_IO_LIST_EMAIL_ACCOUNTS: "email_accounts.list",
  REPLY_IO_LIST_LISTS: "contact_lists.list",
  REPLY_IO_LIST_SEQUENCES: "sequences.list",
  REPLY_IO_LIST_SEQUENCE_STEPS: "sequences.steps.list",
  REPLY_IO_PAUSE_SEQUENCE: "sequences.pause",
  REPLY_IO_REMOVE_CONTACT_FROM_SEQUENCE: "sequences.contacts.remove",
  REPLY_IO_REMOVE_CONTACTS_FROM_SEQUENCE: "sequences.contacts.remove_bulk",
  REPLY_IO_SEARCH_CONTACTS: "contacts.search",
  REPLY_IO_SET_CONTACT_STATUS: "contacts.set_status",
  REPLY_IO_START_SEQUENCE: "sequences.start",
  REPLY_IO_UPDATE_CONTACT: "contacts.update",
  REPLY_IO_UPDATE_EMAIL_ACCOUNT: "email_accounts.update",
};

const HOLES = ["REPLY_IO_DELETE_USER"] as const;
const LOCAL_OPS = new Set(["ulid.generate"]);
const OAUTH_START_OPS = new Set([
  "email_accounts.connect_gmail",
  "email_accounts.connect_office365",
]);

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("reply-io manifest", () => {
  test("has bounded hosts, origin auth, and compiles", () => {
    expect(manifest.key).toBe("reply-io");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.network.allowedHosts).toEqual(["api.reply.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.reply.io");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations and request contract", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v3/whoami" });
    expect(requestOf("contacts.list")).toMatchObject({ method: "GET", path: "/v3/contacts" });
    expect(requestOf("contacts.get")).toMatchObject({ method: "GET", path: "/v3/contacts/{{id}}" });
    expect(requestOf("sequences.list")).toMatchObject({ method: "GET", path: "/v3/sequences" });
    expect(requestOf("sequences.get")).toMatchObject({ method: "GET", path: "/v3/sequences/{{id}}" });
    expect((requestOf("contacts.list").query as Record<string, string>).skip).toBe("{{skip}}");
    expect((requestOf("contacts.list").query as Record<string, string>).top).toBe("{{top}}");
    expect((requestOf("contacts.list").query as Record<string, string>).email).toBe("{{email}}");
    expect((requestOf("sequences.list").query as Record<string, string>).name).toBe("{{name}}");
  });

  test("covers every mapped Composio Reply.io tool with a real handler", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(32);
    expect(HOLES).toHaveLength(1);
    expect(Object.keys(operations).length).toBe(34);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (!LOCAL_OPS.has(key)) expect(requestOf(key), slug).toBeDefined();
      expect(actions[key as keyof typeof actions], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(operations["users.list"]).toBeDefined();
    expect(requestOf("users.list")).toMatchObject({ method: "GET", path: "/v3/whoami/team-users" });
  });

  test("gives every action a title, description, object inputSchema, and request or local handler", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (LOCAL_OPS.has(key)) {
        expect(operation.request, key).toBeUndefined();
        expect(actions[key as keyof typeof actions], key).toBeTypeOf("function");
        continue;
      }
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (LOCAL_OPS.has(key)) {
        expect(operation.sideEffect, key).toBe("read");
        continue;
      }
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (key === "email_accounts.list_disconnected") expect(operation.sideEffect, key).toBe("read");
      else if (OAUTH_START_OPS.has(key)) expect(operation.sideEffect, key).toBe("write");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
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

  test("puts Content-Type only on JSON bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
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

  test("maps documented Reply.io v3 paths", () => {
    expect(requestOf("contacts.search")).toMatchObject({ method: "GET", path: "/v3/contacts" });
    expect((requestOf("contacts.search").query as Record<string, string>).email).toBe("{{email}}");
    expect(requestOf("contacts.create")).toMatchObject({ method: "POST", path: "/v3/contacts" });
    expect(requestOf("contacts.update")).toMatchObject({ method: "PATCH", path: "/v3/contacts/{{id}}" });
    expect(requestOf("contacts.delete")).toMatchObject({ method: "DELETE", path: "/v3/contacts/{{id}}" });
    expect(requestOf("contacts.move_to_sequence")).toMatchObject({
      method: "POST",
      path: "/v3/contacts/{{id}}/move-to-sequence",
    });
    expect(requestOf("contacts.statuses").path).toBe("/v3/contacts/{{id}}/statuses");
    expect(requestOf("contacts.set_status").path).toBe("/v3/contacts/set-status-in-sequence");
    expect(requestOf("contacts.clear_opt_out").path).toBe("/v3/contacts/set-opted-out");
    expect(requestOf("sequences.start").path).toBe("/v3/sequences/{{id}}/start");
    expect(requestOf("sequences.pause").path).toBe("/v3/sequences/{{id}}/pause");
    expect(requestOf("sequences.archive").path).toBe("/v3/sequences/{{id}}/archive");
    expect(requestOf("sequences.delete").path).toBe("/v3/sequences/{{id}}");
    expect(requestOf("sequences.steps.list").path).toBe("/v3/sequences/{{id}}/steps");
    expect(requestOf("sequences.steps.create").path).toBe("/v3/sequences/{{id}}/steps");
    expect(requestOf("sequences.steps.get").path).toBe("/v3/sequences/{{id}}/steps/{{step_id}}");
    expect(requestOf("sequences.contacts.state").path).toBe("/v3/sequences/{{id}}/contacts/state");
    expect(requestOf("sequences.contacts.remove").path).toBe(
      "/v3/sequences/{{id}}/contact-links/{{contact_id}}",
    );
    expect(requestOf("sequences.contacts.remove_bulk").path).toBe(
      "/v3/sequences/{{id}}/contact-links/bulk-delete",
    );
    expect(requestOf("email_accounts.list").path).toBe("/v3/email-accounts");
    expect(requestOf("email_accounts.connect_gmail")).toMatchObject({
      method: "GET",
      path: "/v3/email-accounts/connect/gmail",
      success: [302],
    });
    expect(requestOf("email_accounts.connect_office365")).toMatchObject({
      method: "GET",
      path: "/v3/email-accounts/connect/office-365",
      success: [302],
    });
    expect(requestOf("email_accounts.list_disconnected")).toMatchObject({
      method: "POST",
      path: "/v3/email-accounts/filter",
    });
    expect(requestOf("email_accounts.update")).toEqual({
      method: "PATCH",
      path: "/v3/email-accounts/{{id}}",
      success: [200],
      headers: { "Content-Type": "application/json" },
      body: {
        connection: "{{connection}}",
        safety: "{{safety}}",
        signature: "{{signature}}",
        optOut: "{{optOut}}",
        rampUp: "{{rampUp}}",
        tags: "{{tags}}",
      },
    });
    expect(requestOf("email_accounts.update").baseUrl).toBeUndefined();
    expect(requestOf("email_accounts.delete").path).toBe("/v3/email-accounts/{{id}}");
    expect(requestOf("contact_lists.list").path).toBe("/v3/contact-lists");
    expect(requestOf("schedules.delete").path).toBe("/v3/schedules/{{id}}");
    expect(compiled.actions["ulid.generate"]).toBeUndefined();
    expect(actions["ulid.generate"]).toBeTypeOf("function");
  });

  test("uses official 204 empty-body deletes without request.result", () => {
    for (const key of [
      "contacts.delete",
      "contacts.move_to_sequence",
      "sequences.delete",
      "sequences.contacts.remove",
      "email_accounts.delete",
      "schedules.delete",
    ]) {
      expect(requestOf(key).success).toEqual([204]);
      expect(requestOf(key).result, key).toBeUndefined();
      expect((operations[key]!.outputSchema as { properties: { data: { type: unknown } } }).properties.data.type).toEqual(
        ["object", "null"],
      );
    }
  });

  test("oauth starts capture Location from official 302", () => {
    for (const key of OAUTH_START_OPS) {
      expect(requestOf(key).success).toEqual([302]);
      expect(requestOf(key).result).toEqual({ data: { location: "{{headers.location}}" } });
      expect(actions[key as keyof typeof actions]).toBeTypeOf("function");
    }
  });

  test("saves a legacy custom SMTP mailbox with POST /v1/EmailAccounts", () => {
    const save = operations["email_accounts.v1.save"]!;
    const update = operations["email_accounts.update"]!;
    expect(save.timeoutMs).toBe(update.timeoutMs);
    expect(save.maxInputBytes).toBe(update.maxInputBytes);
    expect(save.maxResponseBytes).toBe(update.maxResponseBytes);
    expect(save.responseFormat).toBe("json");
    expect(save.validationMode).toBe("strict-generated");
    expect(save.enforceOutputSchema).toBe(true);
    expect(save.sideEffect).toBe("write");
    const request = save.request as {
      method: string;
      path: string;
      baseUrl?: string;
      success: number[];
      headers: Record<string, string>;
      body: Record<string, string>;
    };
    expect(request).toEqual({
      method: "POST",
      path: "/v1/EmailAccounts",
      success: [200, 201],
      headers: { "Content-Type": "application/json" },
      body: {
        Email: "{{email}}",
        "Daily Limit": "{{dailyLimit}}",
        SenderName: "{{senderName}}",
        SmtpHost: "{{smtpHost}}",
        SmtpPort: "{{smtpPort}}",
        SmtpPassword: "{{smtpPassword}}",
        SmtpSsl: "{{smtpSsl}}",
        ImapHost: "{{imapHost}}",
        ImapPort: "{{imapPort}}",
        ImapPassword: "{{imapPassword}}",
        ImapSsl: "{{imapSsl}}",
      },
    });
    expect(request.baseUrl).toBeUndefined();
    const schema = save.inputSchema as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { type: string }>;
    };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(true);
    expect(schema.required).toEqual([
      "email",
      "dailyLimit",
      "senderName",
      "smtpHost",
      "smtpPort",
      "smtpPassword",
      "imapHost",
      "imapPort",
      "imapPassword",
    ]);
    expect(Object.keys(schema.properties)).toEqual([
      "email",
      "dailyLimit",
      "senderName",
      "smtpHost",
      "smtpPort",
      "smtpPassword",
      "smtpSsl",
      "imapHost",
      "imapPort",
      "imapPassword",
      "imapSsl",
    ]);
    expect(schema.properties.dailyLimit.type).toBe("integer");
    expect(schema.properties.smtpPort.type).toBe("integer");
    expect(schema.properties.imapPort.type).toBe("integer");
    expect(schema.properties.smtpSsl.type).toBe("boolean");
    expect(schema.properties.imapSsl.type).toBe("boolean");
    expect(schema.properties).not.toHaveProperty("Daily Limit");
    const output = save.outputSchema as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: { data: { type: string; additionalProperties: boolean; properties: { id: { type: string } }; required: string[] } };
    };
    expect(output.type).toBe("object");
    expect(output.additionalProperties).toBe(false);
    expect(output.required).toEqual(["data"]);
    expect(output.properties.data).toEqual({
      type: "object",
      properties: { id: { type: "integer" } },
      additionalProperties: true,
      required: ["id"],
    });
  });

  test("mirrors the deepened v1 save in the recipe and keeps provenance mappings pinned", async () => {
    const recipePath = "scripts/connector-gen/openconnector/recipes/reply_io/recipe.json";
    const recipe = await Bun.file(recipePath).json();
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    for (const operation of Object.values(recipe.manifest.operations) as Array<Record<string, unknown>>) {
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });
});
