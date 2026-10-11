import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/cases.json";
import whoami from "../fixtures/whoami.json";
import paginated from "../fixtures/paginated.json";
import item from "../fixtures/item.json";
import capture from "../fixtures/capture.json";
import query from "../fixtures/query.json";
import unauthorized from "../fixtures/unauthorized.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const creds = { apiKey: "phx_test", region: "us" };

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_m, name: string) => {
    const value = Object.hasOwn(input, name) ? input[name] : (creds as Record<string, unknown>)[name];
    return encodeURIComponent(String(value));
  });
}

function payloadFor(key: string): unknown {
  if (key === "healthcheck" || key === "users.me" || key.startsWith("users.")) return whoami;
  if (key.startsWith("capture.")) return capture;
  if (key === "query.create" || key === "query.get") return query;
  if (key.endsWith(".list") || key.includes(".list") || key === "feature_flags.local_evaluation" || key === "feature_flags.evaluation_reasons") {
    return paginated;
  }
  return item;
}

describe("posthog connector compiles to real HTTP", () => {
  test("exposes one handler per declared action", () => {
    const actionKeys = Object.keys(manifest.operations).sort();
    expect(Object.keys(actions).sort()).toEqual(actionKeys);
    expect(actionKeys.length).toBe((cases as Array<{ key: string }>).length);
  });

  for (const entry of cases as Array<{
    key: string;
    method: string;
    path: string;
    input: Record<string, unknown>;
    host: string;
  }>) {
    test(`${entry.key} ${entry.method} ${entry.path}`, async () => {
      const seen: Request[] = [];
      const result = await actions[entry.key]!({
        ...creds,
        ...entry.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          return new Response(JSON.stringify(payloadFor(entry.key)), { status: 200 });
        },
      });
      expect(seen).toHaveLength(1);
      const url = new URL(seen[0]!.url);
      expect(url.hostname).toBe(entry.host);
      expect(url.pathname).toBe(renderPath(entry.path, { ...creds, ...entry.input }));
      expect(seen[0]!.method).toBe(entry.method);
      expect(seen[0]!.headers.get("authorization")).toBe("Bearer phx_test");
      const contentType = seen[0]!.headers.get("content-type");
      if (entry.method === "GET" || entry.method === "DELETE") {
        expect(contentType).toBeNull();
        expect(await seen[0]!.text()).toBe("");
      } else {
        const request = (manifest.operations as Record<string, { request?: { body?: unknown } }>)[entry.key]?.request;
        if (request?.body !== undefined) {
          expect(contentType).toContain("application/json");
        } else {
          expect(contentType).toBeNull();
        }
      }
      expect((result as { connector: string }).connector).toBe("posthog");
      expect((result as { source: string }).source).toBe("provider");
    });
  }

  test("healthcheck uses credential-only input and returns status plus user fields", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({
      ...creds,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify(whoami), { status: 200 });
      },
    });
    expect(seen[0]!.url).toBe("https://us.posthog.com/api/users/@me/");
    expect(result).toMatchObject({
      connector: "posthog",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      uuid: whoami.uuid,
      email: whoami.email,
    });
  });

  test("healthcheck without a credential echoes status", () => {
    const result = actions.healthcheck!({ region: "us" }) as Record<string, unknown>;
    expect(result.source).toBe("connector");
    expect(result.status).toBe("ok");
  });

  test("feature_flags.create posts JSON and omits absent optional fields", async () => {
    const seen: Request[] = [];
    await actions["feature_flags.create"]!({
      ...creds,
      project_id: "1",
      key: "beta-flag",
      name: "Beta",
      active: true,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify(item), { status: 201 });
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.headers.get("content-type")).toContain("application/json");
    const body = JSON.parse(await seen[0]!.text());
    expect(body).toEqual({ key: "beta-flag", name: "Beta", active: true });
  });

  test("query.create is a read POST with a query node body", async () => {
    const seen: Request[] = [];
    const hogql = { kind: "HogQLQuery", query: "SELECT 1" };
    const result = await actions["query.create"]!({
      ...creds,
      project_id: "1",
      query: hogql,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify(query), { status: 200 });
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).pathname).toBe("/api/projects/1/query/");
    expect(JSON.parse(await seen[0]!.text())).toEqual({ query: hogql });
    expect((result as { data: unknown }).data).toEqual(query);
    expect((manifest.operations as Record<string, { sideEffect: string }>)["query.create"].sideEffect).toBe("read");
  });

  test("capture.event posts to the ingest host with the project API key in the body", async () => {
    const seen: Request[] = [];
    const result = await actions["capture.event"]!({
      ...creds,
      project_api_key: "phc_test",
      event: "signed_up",
      distinct_id: "user-1",
      properties: { plan: "pro" },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify(capture), { status: 200 });
      },
    });
    expect(seen[0]!.url).toBe("https://us.i.posthog.com/i/v0/e/");
    expect(JSON.parse(await seen[0]!.text())).toEqual({
      api_key: "phc_test",
      event: "signed_up",
      distinct_id: "user-1",
      properties: { plan: "pro" },
    });
    expect((result as { data: unknown }).data).toEqual(capture);
  });

  test("eu region interpolates the allowlisted host", async () => {
    const seen: Request[] = [];
    await actions["projects.list"]!({
      apiKey: "phx_test",
      region: "eu",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return new Response(JSON.stringify(paginated), { status: 200 });
      },
    });
    expect(new URL(seen[0]!.url).hostname).toBe("eu.posthog.com");
  });

  test("rejects missing path params before calling the provider", async () => {
    const seen: Request[] = [];
    await expect(
      actions["feature_flags.get"]!({
        ...creds,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          return new Response("{}", { status: 200 });
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(seen).toHaveLength(0);
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR with the PostHog detail", async () => {
    await expect(
      actions.healthcheck!({
        ...creds,
        fetch: async () => new Response(JSON.stringify(unauthorized), { status: 401 }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Invalid personal API key." });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(
      actions.healthcheck!({
        ...creds,
        fetch: async () =>
          new Response(JSON.stringify({ detail: "slow" }), { status: 429, headers: { "Retry-After": "9" } }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
