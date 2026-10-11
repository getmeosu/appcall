import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const EXISTING = ["accounts.create", "accounts.delete", "accounts.get", "accounts.list", "accounts.update", "contacts.create", "contacts.delete", "contacts.get", "contacts.list", "contacts.update", "healthcheck", "notes.create", "notes.get", "notes.list", "opportunities.get", "opportunities.list", "products.list", "query", "tasks.create", "tasks.get", "tasks.list", "tickets.get", "tickets.list"] as const;
const ORIGIN_PATHS: Record<string, string> = {
  "healthcheck": "/api/record/account",
  "accounts.get": "/api/record/account/{{id}}",
  "accounts.list": "/api/record/account",
  "accounts.create": "/api/record/account",
  "accounts.update": "/api/record/account/{{id}}",
  "accounts.delete": "/api/record/account/{{id}}",
  "contacts.get": "/api/record/contact/{{id}}",
  "contacts.list": "/api/record/contact",
  "contacts.create": "/api/record/contact",
  "contacts.update": "/api/record/contact/{{id}}",
  "contacts.delete": "/api/record/contact/{{id}}",
  "notes.create": "/api/record/note",
  "notes.get": "/api/record/note/{{id}}",
  "notes.list": "/api/record/note",
  "opportunities.get": "/api/record/opportunity/{{id}}",
  "opportunities.list": "/api/record/opportunity",
  "products.list": "/api/record/product",
  "query": "/api/query",
  "tasks.create": "/api/record/task",
  "tasks.get": "/api/record/task/{{id}}",
  "tasks.list": "/api/record/task",
  "tickets.get": "/api/record/cases/{{id}}",
  "tickets.list": "/api/record/cases"
};

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("fireberry prepared connector", () => {
  const compiled = compileDeclarativeConnector(manifest as never);
  const ops = Object.keys(manifest.operations);

  test("keeps origin operations and covers Composio HTTP tools", () => {
    expect(manifest.version).toBe("0.3.0");
    expect(ops).toHaveLength(125);
    for (const key of EXISTING) {
      const operation = manifest.operations[key] as { request: { path: string } };
      expect(operation.request.path).toBe(ORIGIN_PATHS[key]);
      expect(compiled.actions[key]).toBeTypeOf("function");
    }
    expect(ops.includes("files.create")).toBe(false);
    expect(ops.includes("products.list_all")).toBe(false);
    for (const key of ops) {
      const operation = (manifest.operations as Record<string, { request?: unknown; sideEffect?: string }>)[key];
      expect(operation.request).toBeTruthy();
      if (key.startsWith("metadata.") || key.includes(".list") || key.includes(".get") || key === "healthcheck" || key === "query" || key.startsWith("records.query") || key === "records.related.list" || key === "orders.items") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  test("runs recipe fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(100);
    const covered = new Set<string>();
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
          response: { status: number; headers?: Record<string, string>; bodyFile: string };
        }>;
        expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
      };
      const action = compiled.actions[raw.operation];
      expect(action).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) throw new Error(`${raw.id}: body mismatch ${body}`);
        const got = new Headers(init?.headers);
        const want = new Headers(expected.request.headers ?? {});
        for (const [key, value] of want) {
          if (got.get(key) !== value) throw new Error(`${raw.id}: header ${key}`);
        }
        for (const [key] of got) {
          if (!want.has(key) && key !== "content-length") throw new Error(`${raw.id}: unexpected header ${key}`);
        }
        const bodyBytes = readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile));
        return new Response(bodyBytes, { status: expected.response.status, headers: expected.response.headers });
      };
      const input = { ...raw.input, ...raw.credentials, fetch: fetchStub };
      if (raw.expected.kind === "error") {
        let rejected: { code?: string } | undefined;
        try {
          await action!(input);
        } catch (error) {
          rejected = error as { code?: string };
        }
        expect(index).toBe(raw.exchanges.length);
        expect(rejected?.code).toBe(raw.expected.code);
        continue;
      }
      const result = await action!(input);
      expect(index).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected)).toBe(true);
      if (raw.exchanges.length > 0) covered.add(raw.operation);
    }
    for (const key of ops) expect(covered.has(key)).toBe(true);
  });
});
