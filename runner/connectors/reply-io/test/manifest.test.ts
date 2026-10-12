import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { actions } from "../src/actions";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "contacts.list", "contacts.get", "sequences.list", "sequences.get"] as const;

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
    expect(Object.keys(operations).length).toBe(33);
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
    expect(requestOf("email_accounts.update").path).toBe("/v3/email-accounts/{{id}}");
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

  test("keeps recipe operations equal to runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/reply_io/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.operations).toEqual(operations);
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    for (const operation of Object.values(recipe.manifest.operations) as Array<Record<string, unknown>>) {
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });
});
