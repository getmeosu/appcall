import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("Intercom manifest", () => {
  it("has correct key", () => {
    expect(manifest.key).toBe("intercom");
  });

  it("has version 0.2.0", () => {
    expect(manifest.version).toBe("0.2.0");
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

  it("declares P0 conversation ops plus existing list/healthcheck", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual([
      "admins.list",
      "companies.list",
      "contacts.list",
      "conversations.get",
      "conversations.list",
      "conversations.reply",
      "healthcheck",
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

  it("declares administrator/contact/company/conversation models", () => {
    expect(manifest.models).toEqual(["administrator", "contact", "company", "conversation"]);
  });
});
