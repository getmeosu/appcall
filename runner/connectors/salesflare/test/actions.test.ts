import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import fixture from "../fixtures/contacts.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
  response: { status: number; headers?: Record<string, string>; bodyFile: string };
};
type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
};

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const casesDir = join(import.meta.dir, "../fixtures/cases");

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")) as FixtureCase);
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) =>
    [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return (
      ak.length === bk.length &&
      ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
    );
  }
  return false;
}

describe("salesflare HTTP contract", () => {
  test("uses bearer auth, encodes page, and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["contacts.list"]!({
      apiKey: "secret",
      page: 2,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(fixture);
      },
    });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(new URL(seen[0].url).searchParams.get("page")).toBe("2");
    expect(result).toMatchObject({ contacts: fixture.data });
    expect(seen).toHaveLength(1);
  });

  test("maps unauthorized and malformed responses", async () => {
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(actions["contacts.list"]!({ apiKey: "secret", fetch: async () => response({}) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
  });

  test("creates contacts as a JSON array body against /contacts", async () => {
    const seen: Request[] = [];
    const result = await actions["contacts.create"]!({
      apiKey: "secret",
      force: true,
      contacts: [{ firstname: "Ada", email: "ada@example.com" }],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ id: 101, name: "Ada Lovelace" }, 200);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/contacts");
    expect(new URL(seen[0].url).searchParams.get("force")).toBe("true");
    expect(JSON.parse(await seen[0].text())).toEqual([{ firstname: "Ada", email: "ada@example.com" }]);
    expect(result).toMatchObject({ data: { id: 101 }, connector: "salesflare", action: "contacts.create", source: "provider" });
  });

  test("deletes an account by path id", async () => {
    const seen: Request[] = [];
    const result = await actions["accounts.delete"]!({
      apiKey: "secret",
      account_id: 11,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ success: true });
      },
    });
    expect(seen[0].method).toBe("DELETE");
    expect(new URL(seen[0].url).pathname).toBe("/accounts/11");
    expect(result).toMatchObject({ data: { success: true } });
  });
});

describe("salesflare compiled actions", () => {
  test("compiles one handler per action", () => {
    expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});

describe("salesflare fixture replay", () => {
  const cases = loadCases();

  test("has a fixture for every action", () => {
    expect(new Set(cases.map((fixtureCase) => fixtureCase.operation))).toEqual(new Set(Object.keys(manifest.operations)));
  });

  test("replays every fixture case", async () => {
    for (const fixtureCase of cases) {
      const action = actions[fixtureCase.operation];
      expect(action, fixtureCase.id).toBeDefined();
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const expected = fixtureCase.exchanges[index++];
        if (!expected) throw new Error(`${fixtureCase.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(
            `${fixtureCase.id}: request mismatch ${method} ${url} vs ${expected.request.method} ${expected.request.url}`,
          );
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          throw new Error(`${fixtureCase.id}: body mismatch ${body} vs ${expected.request.body}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) throw new Error(`${fixtureCase.id}: header mismatch ${key}`);
        }
        for (const [key] of gotHeaders) {
          if (!expectedHeaders.has(key) && key !== "content-length") {
            throw new Error(`${fixtureCase.id}: unexpected header ${key}`);
          }
        }
        const bodyBytes = readFileSync(join(dirname(join(casesDir, `${fixtureCase.id}.json`)), expected.response.bodyFile));
        return new Response(bodyBytes, { status: expected.response.status, headers: expected.response.headers });
      };
      const payload = { ...fixtureCase.input, ...fixtureCase.credentials, fetch: fetchStub };
      if (fixtureCase.expected.kind === "error") {
        try {
          await action!(payload);
          throw new Error(`${fixtureCase.id}: expected ${fixtureCase.expected.code}`);
        } catch (error) {
          expect((error as { code?: string }).code, fixtureCase.id).toBe(fixtureCase.expected.code);
        }
        continue;
      }
      const result = await action!(payload);
      const expected = JSON.parse(readFileSync(join(casesDir, fixtureCase.expected.resultFile), "utf8"));
      if (!deepEqual(result, expected)) {
        throw new Error(`${fixtureCase.id}: result mismatch ${JSON.stringify(result)} vs ${JSON.stringify(expected)}`);
      }
      expect(index).toBe(fixtureCase.exchanges.length);
    }
  });
});
