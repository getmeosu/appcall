import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import list from "../fixtures/list.json";
import created from "../fixtures/created.json";
import scim from "../fixtures/scim_users.json";
import routes from "../fixtures/deepened_routes.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const { actions } = compileDeclarativeConnector(manifest as never);
const ORIGINAL = [
  "healthcheck",
  "entities.list",
  "entities.get",
  "notes.list",
  "notes.get",
  "members.list",
  "members.get",
];

const response = (body: unknown, status = 200) =>
  new Response(body === null ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("productboard composio coverage", () => {
  test("compiles every new action", () => {
    for (const route of routes as Array<{ key: string }>) {
      expect(actions[route.key], route.key).toBeTypeOf("function");
      expect(ORIGINAL.includes(route.key)).toBe(false);
    }
  });

  test("hits the documented Productboard path for each added tool", async () => {
    for (const route of routes as Array<{
      key: string;
      method: string;
      path: string;
      api: string;
      input: Record<string, unknown>;
      query: Record<string, unknown>;
      listResponse: boolean;
    }>) {
      const seen: Request[] = [];
      const isDelete = route.method === "DELETE";
      const isScim = route.api === "scim";
      await actions[route.key]!({
        accessToken: "secret",
        ...route.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          if (isDelete) return response(null, 204);
          if (isScim) return response(scim);
          if (route.listResponse) return response(list, route.method === "POST" ? 200 : 200);
          if (route.method === "POST") return response(created, 201);
          if (route.method === "PUT" || route.method === "PATCH") return response(created, 200);
          return response({ data: list.data[0] });
        },
      });
      expect(seen, route.key).toHaveLength(1);
      const url = new URL(seen[0].url);
      expect(url.origin, route.key).toBe("https://api.productboard.com");
      if (route.api === "v2") {
        expect(url.pathname, route.key).toBe(`/v2${route.path}`);
      } else if (route.api === "scim") {
        expect(url.pathname, route.key).toBe(`/scim/v2${route.path}`);
      } else {
        expect(url.pathname, route.key).toBe(route.path);
        expect(seen[0].headers.get("x-version"), route.key).toBe("1");
      }
      expect(seen[0].method, route.key).toBe(route.method);
      expect(seen[0].headers.get("authorization"), route.key).toBe("Bearer secret");
      for (const [name, value] of Object.entries(route.query ?? {})) {
        if (Array.isArray(value)) {
          expect(url.searchParams.getAll(name), `${route.key} ${name}`).toEqual(value.map(String));
        } else {
          expect(url.searchParams.get(name), `${route.key} ${name}`).toBe(String(value));
        }
      }
    }
  });

  test("v1 writes send X-Version and JSON bodies", async () => {
    const seen: Request[] = [];
    await actions["features.create"]!({
      accessToken: "secret",
      data: { name: "SSO", type: "feature" },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(created, 201);
      },
    });
    expect(seen[0].url).toBe("https://api.productboard.com/features");
    expect(seen[0].headers.get("x-version")).toBe("1");
    expect(seen[0].headers.get("content-type")).toContain("application/json");
    expect(await seen[0].json()).toEqual({ data: { name: "SSO", type: "feature" } });
  });

  test("v2 webhook create maps notification fields", async () => {
    const seen: Request[] = [];
    await actions["webhooks.create"]!({
      accessToken: "secret",
      url: "https://example.com/hooks/productboard",
      name: "Feature changes",
      events: [{ eventType: "feature.updated" }],
      notification_version: 1,
      notification_headers: { authorization: "Bearer hook" },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(created, 201);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v2/webhooks");
    expect(await seen[0].json()).toEqual({
      data: {
        fields: {
          name: "Feature changes",
          events: [{ eventType: "feature.updated" }],
          notification: {
            url: "https://example.com/hooks/productboard",
            version: 1,
            headers: { authorization: "Bearer hook" },
          },
        },
      },
    });
  });

  test("delete entity treats 204 as success", async () => {
    const result = await actions["entities.delete"]!({
      accessToken: "secret",
      id: "ent-1",
      fetch: async () => response(null, 204),
    });
    expect(result).toMatchObject({ ok: true, status: 204, source: "provider" });
  });
});
