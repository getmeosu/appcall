import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Intercom manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("intercom");
  });

  it("has version 0.6.0", () => {
    expect(manifest.version).toBe("0.6.0");
  });

  it("uses bun runtime", () => {
    expect(manifest.runtime).toBe("bun");
  });

  it("declares api_key auth with accessToken", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(
      manifest.auth.setup.fields.some((field: { key: string }) => field.key === "accessToken"),
    ).toBe(true);
  });

  it("allows api.intercom.io", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.intercom.io"]);
  });

  it("uses Bearer accessToken auth", () => {
    expect(manifest.http.auth).toEqual({
      field: "accessToken",
      in: "header",
      name: "Authorization",
      value: "Bearer {{accessToken}}",
    });
  });

  it("pins Intercom-Version 2.13", () => {
    expect(manifest.http.headers["Intercom-Version"]).toBe("2.13");
    expect(manifest.http.baseUrl).toBe("https://api.intercom.io");
  });

  it("declares deepen ops (close/assign/tag/reply + get/search) plus lists", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "admins.get",
      "admins.list",
      "companies.create",
      "companies.delete",
      "companies.get",
      "companies.list",
      "companies.list_contacts",
      "companies.update",
      "contacts.archive",
      "contacts.attach_company",
      "contacts.create",
      "contacts.delete",
      "contacts.detach_company",
      "contacts.get",
      "contacts.list",
      "contacts.list_companies",
      "contacts.list_tags",
      "contacts.merge",
      "contacts.search",
      "contacts.tag",
      "contacts.unarchive",
      "contacts.untag",
      "contacts.update",
      "conversations.assign",
      "conversations.attach_contact",
      "conversations.close",
      "conversations.create",
      "conversations.get",
      "conversations.list",
      "conversations.reopen",
      "conversations.reply",
      "conversations.search",
      "conversations.tag",
      "conversations.untag",
      "healthcheck",
      "notes.create",
      "notes.get",
      "notes.list",
      "tags.create",
      "tags.get",
      "tags.list",
      "teams.get",
      "teams.list",
      "tickets.create",
      "tickets.delete",
      "tickets.get",
      "tickets.list",
      "tickets.reply",
      "tickets.tag",
      "tickets.untag",
      "tickets.update",
    ]);
    expect(manifest.operations["conversations.list"].sideEffect).toBe("read");
    expect(manifest.operations["conversations.get"].sideEffect).toBe("read");
    expect(manifest.operations["conversations.reply"].sideEffect).toBe("write");
    expect(manifest.operations["conversations.list"].request.method).toBe("GET");
    expect(manifest.operations["conversations.list"].request.path).toBe("/conversations");
    expect(manifest.operations["conversations.get"].request.path).toBe("/conversations/{{id}}");
    expect(manifest.operations["conversations.reply"].request.method).toBe("POST");
    expect(manifest.operations["conversations.reply"].request.path).toBe(
      "/conversations/{{id}}/reply",
    );
  });

  it("wires close/assign/tag Reconcile → conversations.get", () => {
    for (const key of ["conversations.close", "conversations.assign", "conversations.tag"] as const) {
      const op = manifest.operations[key] as {
        effectPolicy?: string;
        reconcile?: string;
        sideEffect?: string;
      };
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe("conversations.get");
      expect(op.sideEffect).toBe("write");
    }
    expect(manifest.operations["conversations.close"].request.path).toBe(
      "/conversations/{{id}}/parts",
    );
    expect(manifest.operations["conversations.assign"].request.path).toBe(
      "/conversations/{{id}}/parts",
    );
    expect(manifest.operations["conversations.tag"].request.path).toBe(
      "/conversations/{{id}}/tags",
    );
  });

  it("declares conversations.reply as a create with no EffectPolicy", () => {
    const reply = manifest.operations["conversations.reply"] as Record<string, unknown>;
    expect(reply.sideEffect).toBe("write");
    expect(Object.hasOwn(reply, "effectPolicy")).toBe(false);
    expect(Object.hasOwn(reply, "reconcile")).toBe(false);
  });

  it("declares contacts.get + conversations.search as reads", () => {
    expect(manifest.operations["contacts.get"].sideEffect).toBe("read");
    expect(manifest.operations["contacts.get"].request.path).toBe("/contacts/{{id}}");
    expect(manifest.operations["conversations.search"].sideEffect).toBe("read");
    expect(manifest.operations["conversations.search"].request.method).toBe("POST");
    expect(manifest.operations["conversations.search"].request.path).toBe("/conversations/search");
  });

  it("does not declare deferred open/snooze (reopen covers open)", () => {
    for (const key of [
      "conversations.open",
      "conversations.snooze",
    ]) {
      expect(manifest.operations[key as keyof typeof manifest.operations]).toBeUndefined();
    }
  });

  it("declares administrator/contact/company/conversation/ticket/tag/note/team models", () => {
    expect(manifest.models).toEqual(["administrator", "contact", "company", "conversation", "ticket", "tag", "note", "team"]);
  });

  it("declares contact/company/ticket/tag write and read ops with tool schemas", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(ops["contacts.create"].sideEffect).toBe("write");
    expect(ops["contacts.update"].sideEffect).toBe("write");
    expect(ops["contacts.delete"].sideEffect).toBe("destructive");
    expect(ops["contacts.delete"].request).toMatchObject({ method: "DELETE", path: "/contacts/{{id}}" });
    expect(ops["companies.create"].request).toMatchObject({ method: "POST", path: "/companies" });
    expect(ops["companies.get"].request).toMatchObject({ method: "GET", path: "/companies/{{id}}" });
    expect(ops["tickets.list"].request).toMatchObject({ method: "POST", path: "/tickets/search" });
    expect(ops["tickets.create"].request).toMatchObject({ method: "POST", path: "/tickets" });
    expect(ops["tickets.reply"].request).toMatchObject({ method: "POST", path: "/tickets/{{id}}/reply" });
    expect(ops["tags.list"].request).toMatchObject({ method: "GET", path: "/tags" });
    expect(ops["tags.create"].request).toMatchObject({ method: "POST", path: "/tags" });
    expect(ops["contacts.tag"].request).toMatchObject({ method: "POST", path: "/contacts/{{id}}/tags" });
    expect(ops["admins.get"].request).toMatchObject({ method: "GET", path: "/admins/{{id}}" });
    for (const key of [
      "contacts.create",
      "contacts.update",
      "contacts.delete",
      "companies.create",
      "companies.get",
      "tickets.list",
      "tickets.create",
      "tickets.reply",
      "tags.list",
      "tags.create",
      "contacts.tag",
      "admins.get",
    ]) {
      expect(String(ops[key].title ?? "").length).toBeGreaterThan(0);
      expect(String(ops[key].description ?? "").length).toBeGreaterThan(0);
      expect((ops[key].inputSchema as { type?: string }).type).toBe("object");
      expect(ops[key].outputSchema).toBeDefined();
    }
  });

  it("declares G1 ops with exact request shapes", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(51);
    expect(ops["conversations.reopen"].request).toEqual({
      method: "POST",
      path: "/conversations/{{id}}/parts",
      body: { message_type: "open", admin_id: "{{adminId}}" },
      success: [200],
    });
    expect(ops["conversations.untag"].request).toEqual({
      method: "DELETE",
      path: "/conversations/{{id}}/tags/{{tagId}}",
      body: { admin_id: "{{adminId}}" },
      success: [200],
    });
    expect(ops["contacts.untag"].request).toEqual({
      method: "DELETE",
      path: "/contacts/{{id}}/tags/{{tagId}}",
      success: [200],
    });
    expect(ops["conversations.create"].request).toMatchObject({ method: "POST", path: "/conversations" });
    expect(ops["contacts.search"].request).toMatchObject({ method: "POST", path: "/contacts/search" });
    expect(ops["contacts.archive"].request).toMatchObject({ method: "POST", path: "/contacts/{{id}}/archive" });
    expect(ops["contacts.unarchive"].request).toMatchObject({ method: "POST", path: "/contacts/{{id}}/unarchive" });
    expect(ops["contacts.attach_company"].request).toMatchObject({
      method: "POST",
      path: "/contacts/{{id}}/companies",
      body: { id: "{{companyId}}" },
    });
    expect(ops["contacts.detach_company"].request).toMatchObject({
      method: "DELETE",
      path: "/contacts/{{id}}/companies/{{companyId}}",
    });
    expect(ops["companies.update"].request).toMatchObject({ method: "PUT", path: "/companies/{{id}}" });
    expect(ops["companies.delete"].request).toMatchObject({ method: "DELETE", path: "/companies/{{id}}" });
    expect(ops["tickets.get"].request).toMatchObject({ method: "GET", path: "/tickets/{{id}}" });
    expect(ops["tickets.update"].request).toMatchObject({ method: "PUT", path: "/tickets/{{id}}" });
    expect(ops["tickets.delete"].request).toMatchObject({ method: "DELETE", path: "/tickets/{{id}}" });
    expect(ops["teams.list"].request).toMatchObject({ method: "GET", path: "/teams" });
  });

  it("wires G1 effects: 5 Reconcile against exact observes, 10 omit effect keys", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    const reconcile: Record<string, string> = {
      "conversations.reopen": "conversations.get",
      "conversations.untag": "conversations.get",
      "contacts.untag": "contacts.get",
      "companies.update": "companies.get",
      "tickets.update": "tickets.get",
    };
    for (const [key, observe] of Object.entries(reconcile)) {
      expect(ops[key].sideEffect).toBe("write");
      expect(ops[key].effectPolicy).toBe("Reconcile");
      expect(ops[key].reconcile).toBe(observe);
      expect(ops[observe].sideEffect).toBe("read");
    }
    const omitted: Record<string, string> = {
      "conversations.create": "write",
      "contacts.search": "read",
      "contacts.archive": "write",
      "contacts.unarchive": "write",
      "contacts.attach_company": "write",
      "contacts.detach_company": "write",
      "companies.delete": "destructive",
      "tickets.get": "read",
      "tickets.delete": "destructive",
      "teams.list": "read",
    };
    for (const [key, sideEffect] of Object.entries(omitted)) {
      expect(ops[key].sideEffect).toBe(sideEffect);
      expect(ops[key].effectPolicy).toBeUndefined();
      expect(ops[key].reconcile).toBeUndefined();
    }
    for (const key of [...Object.keys(reconcile), ...Object.keys(omitted)]) {
      expect(String(ops[key].title ?? "").length).toBeGreaterThan(0);
      expect(String(ops[key].description ?? "").length).toBeGreaterThan(0);
      expect(ops[key].enforceOutputSchema).toBe(true);
      expect(ops[key].validationMode).toBe("strict-generated");
      expect((ops[key].inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

  it("names the primary resource id and camelCases the other ids", () => {
    const ops = manifest.operations as Record<string, { inputSchema: { properties: Record<string, unknown> } }>;
    expect(Object.keys(ops["conversations.untag"].inputSchema.properties)).toEqual(["id", "tagId", "adminId"]);
    expect(Object.keys(ops["contacts.untag"].inputSchema.properties)).toEqual(["id", "tagId"]);
    expect(Object.keys(ops["contacts.attach_company"].inputSchema.properties)).toEqual(["id", "companyId"]);
    expect(Object.keys(ops["contacts.detach_company"].inputSchema.properties)).toEqual(["id", "companyId"]);
    expect(Object.keys(ops["conversations.reopen"].inputSchema.properties)).toEqual(["id", "adminId"]);
  });

  it("declares G2 ops with exact request shapes", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(ops["notes.create"].request).toEqual({
      method: "POST",
      path: "/contacts/{{id}}/notes",
      body: { body: "{{body}}", admin_id: "{{adminId}}" },
      success: [200],
    });
    expect(ops["contacts.merge"].request).toEqual({
      method: "POST",
      path: "/contacts/merge",
      body: { from: "{{fromContactId}}", into: "{{intoContactId}}" },
      success: [200],
    });
    expect(ops["conversations.attach_contact"].request).toEqual({
      method: "POST",
      path: "/conversations/{{id}}/customers",
      body: { admin_id: "{{adminId}}", customer: { intercom_user_id: "{{contactId}}" } },
      success: [200],
    });
    expect(ops["tickets.tag"].request).toEqual({
      method: "POST",
      path: "/tickets/{{id}}/tags",
      body: { id: "{{tagId}}", admin_id: "{{adminId}}" },
      success: [200],
    });
    expect(ops["tickets.untag"].request).toEqual({
      method: "DELETE",
      path: "/tickets/{{id}}/tags/{{tagId}}",
      body: { admin_id: "{{adminId}}" },
      success: [200],
    });
    const reads: Record<string, string> = {
      "notes.list": "/contacts/{{id}}/notes",
      "notes.get": "/notes/{{id}}",
      "teams.get": "/teams/{{id}}",
      "contacts.list_companies": "/contacts/{{id}}/companies",
      "companies.list_contacts": "/companies/{{id}}/contacts",
      "contacts.list_tags": "/contacts/{{id}}/tags",
      "tags.get": "/tags/{{id}}",
    };
    for (const [key, path] of Object.entries(reads)) {
      expect(ops[key].request).toEqual({ method: "GET", path, success: [200] });
      expect((ops[key].inputSchema as { required?: string[] }).required).toEqual(["id"]);
      expect(Object.keys((ops[key].inputSchema as { properties: object }).properties)).toEqual(["id"]);
    }
  });

  it("wires G2 effects: 1 Reconcile against conversations.get, 11 omit effect keys", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(ops["conversations.attach_contact"].sideEffect).toBe("write");
    expect(ops["conversations.attach_contact"].effectPolicy).toBe("Reconcile");
    expect(ops["conversations.attach_contact"].reconcile).toBe("conversations.get");
    const omitted: Record<string, string> = {
      "notes.create": "write",
      "contacts.merge": "write",
      "tickets.tag": "write",
      "tickets.untag": "write",
      "notes.list": "read",
      "notes.get": "read",
      "teams.get": "read",
      "contacts.list_companies": "read",
      "companies.list_contacts": "read",
      "contacts.list_tags": "read",
      "tags.get": "read",
    };
    for (const [key, sideEffect] of Object.entries(omitted)) {
      expect(ops[key].sideEffect).toBe(sideEffect);
      expect(ops[key].effectPolicy).toBeUndefined();
      expect(ops[key].reconcile).toBeUndefined();
    }
    for (const key of ["conversations.attach_contact", ...Object.keys(omitted)]) {
      expect(String(ops[key].title ?? "").length).toBeGreaterThan(0);
      expect(String(ops[key].description ?? "").length).toBeGreaterThan(0);
      expect(ops[key].enforceOutputSchema).toBe(true);
      expect(ops[key].validationMode).toBe("strict-generated");
      expect((ops[key].inputSchema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
    }
  });

});
