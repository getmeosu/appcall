import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const res = (b: unknown, s = 200, h?: HeadersInit) => new Response(JSON.stringify(b), { status: s, headers: h });

describe("clockify origin contract", () => {
  test("auth header on origin operations", async () => {
    for (const n of ["healthcheck", "workspaces.list", "projects.list", "tasks.list"] as const) {
      const a: Record<string, unknown> = {
        apiKey: "secret",
        fetch: async (i: RequestInfo | URL, x?: RequestInit) => {
          expect(new Request(i, x).headers.get("x-api-key")).toBe("secret");
          return res(n === "healthcheck" ? {} : []);
        },
      };
      if (n.includes("projects") || n.includes("tasks")) {
        a.workspaceId = "w";
        if (n.includes("tasks")) a.projectId = "p";
      }
      await actions[n]!(a);
    }
  });

  test("errors malformed", async () => {
    for (const s of [401, 429]) {
      await expect(actions["workspaces.list"]!({ apiKey: "x", fetch: async () => res({}, s, { "retry-after": "7" }) })).rejects.toBeTruthy();
    }
    await expect(actions["workspaces.list"]!({ apiKey: "x", fetch: async () => res({}) })).rejects.toBeTruthy();
  });

  test("healthcheck maps user and optional memberships query", async () => {
    const seen: Request[] = [];
    const user = { id: "u1", name: "Example User" };
    const result = await actions.healthcheck!({
      apiKey: "k",
      "include-memberships": true,
      fetch: async (i, x) => {
        seen.push(new Request(i, x));
        return res(user);
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/api/v1/user");
    expect(new URL(seen[0]!.url).searchParams.get("include-memberships")).toBe("true");
    expect(result).toMatchObject({ user, source: "provider", connector: "clockify" });
  });

  test("projects.list sends page-size from either alias", async () => {
    const seen: Request[] = [];
    await actions["projects.list"]!({
      apiKey: "k",
      workspaceId: "w1",
      pageSize: 25,
      fetch: async (i, x) => { seen.push(new Request(i, x)); return res([]); },
    });
    expect(new URL(seen[0]!.url).searchParams.getAll("page-size")).toEqual(["25"]);
    seen.length = 0;
    await actions["projects.list"]!({
      apiKey: "k",
      workspaceId: "w1",
      "page-size": 40,
      fetch: async (i, x) => { seen.push(new Request(i, x)); return res([]); },
    });
    expect(new URL(seen[0]!.url).searchParams.getAll("page-size")).toEqual(["40"]);
  });
});
