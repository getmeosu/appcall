import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Intercom manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("intercom");
  });

  it("has version 0.4.1", () => {
    expect(manifest.version).toBe("0.4.1");
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
      "companies.get",
      "companies.list",
      "contacts.create",
      "contacts.delete",
      "contacts.get",
      "contacts.list",
      "contacts.tag",
      "contacts.update",
      "conversations.assign",
      "conversations.close",
      "conversations.get",
      "conversations.list",
      "conversations.reply",
      "conversations.search",
      "conversations.tag",
      "healthcheck",
      "tags.create",
      "tags.list",
      "tickets.create",
      "tickets.list",
      "tickets.reply",
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

  it("does not declare deferred open/snooze/untag/create", () => {
    for (const key of [
      "conversations.open",
      "conversations.snooze",
      "conversations.untag",
      "conversations.create",
    ]) {
      expect(manifest.operations[key as keyof typeof manifest.operations]).toBeUndefined();
    }
  });

  it("declares administrator/contact/company/conversation/ticket/tag models", () => {
    expect(manifest.models).toEqual(["administrator", "contact", "company", "conversation", "ticket", "tag"]);
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

});
