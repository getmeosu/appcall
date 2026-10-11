import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import cases from "./depth-cases.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const HANDWRITTEN = new Set([
  "contacts.create",
  "leads.create",
  "opportunities.create",
  "cases.create",
  "accounts.create",
  "accounts.get",
  "accounts.update",
  "accounts.delete",
  "contacts.get",
  "contacts.update",
  "contacts.delete",
  "leads.update",
  "leads.delete",
  "opportunities.get",
  "opportunities.update",
  "opportunities.delete",
  "cases.get",
  "cases.update",
  "cases.delete",
  "sobjects.query",
  "sobjects.search",
  "sobjects.describe",
  "users.me",
  "healthcheck",
]);

type DepthCase = {
  key: string;
  input: Record<string, unknown>;
  method: string;
  status: number;
  path: string;
  query?: Record<string, string | number>;
  body?: string;
};

const CASES = cases as DepthCase[];

describe("salesforce composio depth", () => {
  test("reaches the Composio Salesforce tool count", () => {
    expect(manifest.version).toBe("0.4.0");
    expect(Object.keys(manifest.operations)).toHaveLength(224);
  });

  test("every action has a request block or a handwritten handler", () => {
    for (const [key, spec] of Object.entries(manifest.operations)) {
      const op = spec as { kind?: string; request?: { method?: string; path?: string } };
      if (op.kind === "sync" || op.kind === "webhook") continue;
      const request = op.request;
      const declared = Boolean(request?.method && request?.path);
      expect(declared || HANDWRITTEN.has(key), key).toBe(true);
    }
  });

  test("new operations call the documented Salesforce resources", async () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    for (const spec of CASES) {
      const action = compiled.actions[spec.key];
      expect(typeof action, spec.key).toBe("function");
      let seen: { url: string; method: string; body?: string } | undefined;
      const result = await action!({
        accessToken: "fixture-api-token",
        instance_host: "org.my.salesforce.com",
        ...spec.input,
        fetch: async (url: string | URL, init?: RequestInit) => {
          seen = {
            url: String(url),
            method: String(init?.method ?? "GET"),
            body: init?.body == null ? undefined : String(init.body),
          };
          const raw = spec.status === 204 ? "" : '{"ok":true}';
          return new Response(raw, { status: spec.status, headers: { "content-type": "application/json" } });
        },
      });
      expect(seen?.method, spec.key).toBe(spec.method);
      const url = new URL(seen!.url);
      expect(url.origin + url.pathname, spec.key).toBe(`https://org.my.salesforce.com${spec.path}`);
      const actual = [...url.searchParams.entries()];
      const expected = Object.entries(spec.query ?? {}).map(([key, value]) => [key, String(value)]);
      expect(actual, spec.key).toEqual(expected);
      expect(seen?.body, spec.key).toBe(spec.body);
      expect(result, spec.key).toMatchObject(
        spec.status === 204
          ? { connector: "salesforce", action: spec.key, source: "provider", data: null }
          : { connector: "salesforce", action: spec.key, source: "provider", data: { ok: true } },
      );
    }
  });
});
