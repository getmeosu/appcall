import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest as never);
const cred = { apiKey: "token" };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("missive depth", () => {
  test("keeps the connector key and version 0.2.0 with 38 HTTP actions", () => {
    expect(manifest.key).toBe("missive");
    expect(manifest.version).toBe("0.2.0");
    const ops = Object.entries(manifest.operations);
    expect(ops.filter(([, spec]) => spec.kind === "action")).toHaveLength(38);
    expect(ops.filter(([, spec]) => spec.kind === "webhook")).toEqual([]);
    expect(actions["webhook.incoming_email"]).toBeUndefined();
    expect(Object.keys(actions).sort()).toEqual(
      ops.filter(([, spec]) => spec.kind === "action").map(([key]) => key).sort(),
    );
  });

  test("covers every action with a positive fixture", () => {
    const caseDir = new URL("../fixtures/cases/", import.meta.url);
    const positive = new Set(
      readdirSync(caseDir)
        .filter((name) => name.endsWith(".json"))
        .map(
          (name) =>
            JSON.parse(readFileSync(new URL(name, caseDir), "utf8")) as {
              operation: string;
              expected?: { kind?: string };
            },
        )
        .filter((entry) => entry.expected?.kind === "success")
        .map((entry) => entry.operation),
    );
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, spec]) => spec.kind === "action")
      .map(([key]) => key);
    expect([...positive].sort()).toEqual([...actionKeys].sort());
  });

  test("creates a draft with nested to_fields and lists inbox conversations", async () => {
    let draft: Request | undefined;
    const created = await actions["drafts.create"]!({
      ...cred,
      subject: "Hello",
      body: "World!",
      toAddress: "ada@example.com",
      fetch: async (url: string, init?: RequestInit) => {
        draft = new Request(url, init);
        return response({ drafts: { id: "draft-1" } });
      },
    });
    expect(draft?.method).toBe("POST");
    expect(draft?.headers.get("authorization")).toBe("Bearer token");
    expect(await draft!.clone().json()).toEqual({
      drafts: { subject: "Hello", body: "World!", to_fields: [{ address: "ada@example.com" }] },
    });
    expect(created).toMatchObject({ data: { drafts: { id: "draft-1" } } });

    let listed: Request | undefined;
    await actions["conversations.list"]!({
      ...cred,
      inbox: true,
      fetch: async (url: string, init?: RequestInit) => {
        listed = new Request(url, init);
        return response({ conversations: [] });
      },
    });
    expect(new URL(listed!.url).searchParams.get("inbox")).toBe("true");
  });

  test("rejects missing contact book before fetch", async () => {
    let called = false;
    await expect(
      actions["contacts.list"]!({
        ...cred,
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
});
