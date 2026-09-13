import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "./compile";

const manifest = () => ({
  key: "basic-demo",
  network: { allowedHosts: ["api.demo.test"] },
  auth: {
    setup: {
      fields: [
        { key: "username", required: true, secret: true },
        { key: "password", required: true, secret: true },
      ],
    },
  },
  http: {
    baseUrl: "https://api.demo.test",
    auth: {
      field: "username",
      in: "header" as const,
      name: "Authorization",
      basic: { username: "{{username}}", password: "{{password}}" },
    },
  },
  operations: {
    check: { kind: "action", request: { method: "GET", path: "/check" } },
  },
});

describe("declarative basic auth", () => {
  it("renders UTF-8 credentials as an Authorization header", async () => {
    let request: Request | undefined;
    const action = compileDeclarativeConnector(manifest()).actions.check!;
    await action({
      username: "usér",
      password: "päss",
      fetch: async (input, init) => {
        request = new Request(input, init);
        return new Response("{}", { status: 200 });
      },
    });
    expect(request?.headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("usér:päss", "utf8").toString("base64")}`,
    );
  });

  it("rejects missing or non-string basic credentials before fetch", async () => {
    let calls = 0;
    const action = compileDeclarativeConnector(manifest()).actions.check!;
    for (const input of [
      { username: "user" },
      { username: "user", password: null },
      { username: "user", password: 7 },
    ]) {
      await expect(
        action({
          ...input,
          fetch: async () => {
            calls += 1;
            return new Response("{}");
          },
        }),
      ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    }
    expect(calls).toBe(0);
  });

  it("rejects a colon in username before fetch", async () => {
    let calls = 0;
    const action = compileDeclarativeConnector(manifest()).actions.check!;
    await expect(
      action({
        username: "user:name",
        password: "pass",
        fetch: async () => {
          calls += 1;
          return new Response("{}");
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
  });

  it("allows a literal empty password", async () => {
    let request: Request | undefined;
    const emptyPassword = { ...manifest(), http: { ...manifest().http, auth: { ...manifest().http.auth, basic: { username: "{{username}}", password: "" } } } };
    const action = compileDeclarativeConnector(emptyPassword).actions.check!;
    await action({ username: "api-key", password: "ignored", fetch: async (input, init) => { request = new Request(input, init); return new Response("{}", { status: 200 }); } });
    expect(request?.headers.get("Authorization")).toBe(`Basic ${Buffer.from("api-key:", "utf8").toString("base64")}`);
  });

  it("rejects empty username and templated empty password before fetch", async () => {
    let calls = 0;
    const emptyPassword = { ...manifest(), http: { ...manifest().http, auth: { ...manifest().http.auth, basic: { username: "{{username}}", password: "{{password}}" } } } };
    const action = compileDeclarativeConnector(emptyPassword).actions.check!;
    await expect(action({ username: "user", password: "", fetch: async () => { calls += 1; return new Response("{}"); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
  });

  it("fails closed for invalid basic auth configuration", () => {
    expect(() =>
      compileDeclarativeConnector({
        ...manifest(),
        http: {
          ...manifest().http,
          auth: { ...manifest().http.auth, in: "query", name: "Authorization" },
        },
      }),
    ).toThrow();
    expect(() =>
      compileDeclarativeConnector({
        ...manifest(),
        http: {
          ...manifest().http,
          auth: { ...manifest().http.auth, value: "Basic {{username}}" },
        },
      }),
    ).toThrow();
  });

  it("redacts raw and encoded basic credentials from upstream errors", async () => {
    const action = compileDeclarativeConnector(manifest()).actions.check!;
    await expect(
      action({
        username: "usér",
        password: "päss",
        fetch: async () =>
          new Response(
            JSON.stringify({ message: "usér päss Basic dXPDqXI6cMOkc3M=" }),
            { status: 401 },
          ),
      }),
    ).rejects.toMatchObject({ message: "[REDACTED] [REDACTED] [REDACTED]" });
  });
});
